import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExifReader from 'exifreader';
import exifr from 'exifr';
import JSZip from 'jszip';
import piexif from 'piexifjs';
import { Upload, ShieldCheck, Eye, Pencil, Trash2, Download, FileImage, Search, Sun, Moon, CheckCircle2, AlertTriangle, Layers, FileText, X, Settings2, LockKeyhole, Image as ImageIcon } from 'lucide-react';
import './styles.css';

const FORMAT_INFO = {
  jpg: {name:'JPEG', view:true, edit:true, remove:true, note:'JPEG supports broad EXIF editing and metadata removal.'},
  jpeg:{name:'JPEG', view:true, edit:true, remove:true, note:'JPEG supports broad EXIF editing and metadata removal.'},
  png: {name:'PNG', view:true, edit:false, remove:true, note:'PNG metadata can be inspected. Clean export re-encodes pixels and may drop metadata; custom EXIF writing is not enabled.'},
  webp:{name:'WebP', view:true, edit:false, remove:true, note:'WebP metadata reading depends on the embedded chunks. Clean export depends on browser WebP support.'},
  heic:{name:'HEIC', view:true, edit:false, remove:false, note:'HEIC metadata reading may work, but browser preview/export is not reliable across devices. No modified output is offered here.'},
  heif:{name:'HEIF', view:true, edit:false, remove:false, note:'HEIF metadata reading may work, but browser preview/export is not reliable across devices. No modified output is offered here.'},
  avif:{name:'AVIF', view:true, edit:false, remove:true, note:'AVIF metadata reading varies by file. Clean export is offered only if this browser can decode it.'},
  tif: {name:'TIFF', view:true, edit:false, remove:false, note:'TIFF metadata can be inspected. Reliable browser-side rewrite is not enabled in this build.'},
  tiff:{name:'TIFF', view:true, edit:false, remove:false, note:'TIFF metadata can be inspected. Reliable browser-side rewrite is not enabled in this build.'}
};
const pretty = s => s.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;
const tagValue = v => {
  if (v == null) return '—';
  if (v instanceof Date) return v.toLocaleString();
  if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ');
  if (typeof v === 'object') return v.description || v.value?.toString?.() || JSON.stringify(v);
  return String(v);
};
async function readMeta(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const result = {};
  try {
    const tags = await ExifReader.load(file, {expanded:true, includeUnknown:true});
    for (const [group, values] of Object.entries(tags)) {
      if (values && typeof values === 'object' && !Array.isArray(values)) {
        for (const [k,v] of Object.entries(values)) {
          if (v && typeof v === 'object' && ('description' in v || 'value' in v)) result[`${group}.${k}`] = v.description ?? tagValue(v.value);
        }
      }
    }
  } catch (e) { console.warn('ExifReader metadata scan failed:', e); }
  try {
    const parsed = await exifr.parse(file, { tiff:true, exif:true, gps:true, iptc:true, xmp:true, icc:true, jfif:true, ihdr:true, reviveValues:true });
    if (parsed) for (const [k,v] of Object.entries(parsed)) result[k] = tagValue(v);
  } catch (e) { console.warn('Exifr metadata scan failed:', e); }
  return { ...result, 'File.Name': file.name, 'File.Type': file.type || FORMAT_INFO[ext]?.name || 'Unknown', 'File.Size': bytes(file.size), 'File.Last Modified': new Date(file.lastModified).toLocaleString() };
}
function gpsDecimal(value, ref) {
  if (value == null) return null;
  const nums = Array.isArray(value) ? value.map(Number) : String(value).split(/[ ,]+/).map(Number);
  if (!nums.length || nums.some(n => !Number.isFinite(n))) return null;
  let decimal = nums.length >= 3 ? nums[0] + nums[1]/60 + nums[2]/3600 : nums[0];
  if (['S','W'].includes(String(ref||'').toUpperCase())) decimal *= -1;
  return decimal;
}
function toDms(value) {
  const abs=Math.abs(Number(value)); const d=Math.floor(abs), mf=(abs-d)*60, m=Math.floor(mf), sec=(mf-m)*60;
  return [[d,1],[m,1],[Math.round(sec*10000),10000]];
}
async function readBlobMeta(blob, name='output.jpg') {
  const file = new File([blob], name, {type:blob.type || 'application/octet-stream', lastModified:Date.now()});
  return readMeta(file);
}
function App(){
  const [items,setItems] = useState([]);
  const [active,setActive] = useState(null);
  const [tab,setTab] = useState('view');
  const [dark,setDark] = useState(true);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [metaFields,setMetaFields] = useState({make:'',model:'',software:'',datetime:'',datetimeOriginal:'',datetimeDigitized:'',artist:'',copyright:'',description:'',userComment:'',lensMake:'',lensModel:'',latitude:'',longitude:'',altitude:'',keywords:'',city:'',country:''});
  const [clearOld,setClearOld] = useState(true);
  const setMetaField = (key,value) => setMetaFields(old=>({...old,[key]:value}));
  const [preset,setPreset] = useState('privacy');
  const [customKey,setCustomKey] = useState('');
  const [customValue,setCustomValue] = useState('');
  const current = items.find(x=>x.id===active) || null;
  const extension = f => f.name.split('.').pop().toLowerCase();
  const caps = current ? FORMAT_INFO[extension(current.file)] || {view:true,edit:false,remove:false,note:'This file type is not fully verified for editing or removal.'} : null;
  const entries = useMemo(()=> current ? Object.entries(current.meta).sort(([a],[b])=>a.localeCompare(b)) : [],[current]);
  async function addFiles(list){
    const accepted = [...list].filter(f => /\.(jpe?g|png|webp|heic|heif|avif|tif|tiff)$/i.test(f.name));
    if(!accepted.length){setNotice('Choose JPEG, PNG, WebP, HEIC, AVIF or TIFF files.');return;}
    setBusy(true); setNotice('');
    const next=[];
    for(const file of accepted){
      const meta=await readMeta(file);
      next.push({id:crypto.randomUUID(),file,meta,preview:URL.createObjectURL(file),status:'Ready',output:null});
    }
    setItems(old=>[...old,...next]); if(!active && next[0]) setActive(next[0].id);
    setBusy(false); setNotice(`${next.length} image${next.length===1?'':'s'} added. Metadata shown is read from the selected file; missing tags are not guessed.`);
  }
  function patch(id,patch){setItems(old=>old.map(x=>x.id===id?{...x,...patch}:x));}
  async function cleanOne(item){
    const ext=extension(item.file);
    if(!FORMAT_INFO[ext]?.remove) throw new Error(FORMAT_INFO[ext]?.note || 'Cleaning is not supported for this format.');
    if(['heic','heif','tif','tiff'].includes(ext)) throw new Error(FORMAT_INFO[ext].note);
    const img=new Image(); img.src=item.preview;
    await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('This browser cannot decode this image format, so no output was created.'));});
    const canvas=document.createElement('canvas'); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0);
    const mime=ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='avif'?'image/avif':'image/jpeg';
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,0.96));
    if(!blob) throw new Error(`This browser cannot export ${ext.toUpperCase()}. No output was created.`);
    const outExt=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':blob.type==='image/avif'?'avif':'jpg';
    const name=item.file.name.replace(/\.[^.]+$/,'')+'-clean.'+outExt;
    const afterMeta=await readBlobMeta(blob,name);
    const beforeGps=Object.keys(item.meta).some(k=>/gps|latitude|longitude/i.test(k));
    const afterGps=Object.keys(afterMeta).some(k=>/gps|latitude|longitude/i.test(k));
    return {blob,name,warning:'Output was re-scanned after canvas re-encoding. Pixel quality, ICC profile, EXIF orientation, transparency, animation, and output format can change; verify visually before use.',verification:{before:item.meta,after:afterMeta,gpsRemoved:beforeGps&&!afterGps,metadataKeysBefore:Object.keys(item.meta).length,metadataKeysAfter:Object.keys(afterMeta).filter(k=>!k.startsWith('File.')).length}};
  }
  async function removeCurrent(){
    if(!current)return;
    setBusy(true); setNotice('');
    try { const output=await cleanOne(current); patch(current.id,{output,status:'Clean export ready',verification:output.verification}); setNotice(`Clean export ready: ${output.name}. Download and verify it before sharing.`); }
    catch(e){setNotice(e.message || 'Could not clean this file. Original was not changed.');}
    finally{setBusy(false);}
  }
  async function editCurrent(){
    if(!current)return;
    const ext=extension(current.file);
    if(!['jpg','jpeg'].includes(ext)){setNotice('Writing custom EXIF metadata is currently supported for JPEG only. Other formats stay read-only; the original is unchanged.');return;}
    setBusy(true);setNotice('');
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(current.file);});
      let exifObj;
      try{exifObj=piexif.load(dataUrl);}catch{exifObj={'0th':{},'Exif':{},'GPS':{},'1st':{},'thumbnail':null};}
      if(clearOld) exifObj={'0th':{},'Exif':{},'GPS':{},'1st':{},'thumbnail':null};
      const put=(group,tag,key)=>{if(metaFields[key].trim()) exifObj[group][tag]=metaFields[key].trim();};
      put('0th',piexif.ImageIFD.Make,'make');
      put('0th',piexif.ImageIFD.Model,'model');
      put('0th',piexif.ImageIFD.Software,'software');
      put('0th',piexif.ImageIFD.DateTime,'datetime');
      put('Exif',piexif.ExifIFD.DateTimeOriginal,'datetimeOriginal');
      put('Exif',piexif.ExifIFD.DateTimeDigitized,'datetimeDigitized');
      put('0th',piexif.ImageIFD.Artist,'artist');
      put('0th',piexif.ImageIFD.Copyright,'copyright');
      put('0th',piexif.ImageIFD.ImageDescription,'description');
      put('Exif',piexif.ExifIFD.UserComment,'userComment');
      put('Exif',piexif.ExifIFD.LensMake,'lensMake');
      put('Exif',piexif.ExifIFD.LensModel,'lensModel');
      if(metaFields.latitude.trim() && metaFields.longitude.trim()) {
        const lat=Number(metaFields.latitude), lon=Number(metaFields.longitude);
        if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) throw new Error('GPS coordinates are invalid. Latitude must be -90..90 and longitude -180..180.');
        exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef]=lat<0?'S':'N'; exifObj.GPS[piexif.GPSIFD.GPSLatitude]=toDms(lat);
        exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef]=lon<0?'W':'E'; exifObj.GPS[piexif.GPSIFD.GPSLongitude]=toDms(lon);
        if(metaFields.altitude.trim() && Number.isFinite(Number(metaFields.altitude))) { exifObj.GPS[piexif.GPSIFD.GPSAltitudeRef]=Number(metaFields.altitude)<0?1:0; exifObj.GPS[piexif.GPSIFD.GPSAltitude]=[Math.round(Math.abs(Number(metaFields.altitude))*100),100]; }
      }
      const exifBytes=piexif.dump(exifObj); const outData=piexif.insert(exifBytes,dataUrl);
      const blob=await (await fetch(outData)).blob();
      const output={blob,name:current.file.name.replace(/\.[^.]+$/,'')+'-edited.jpg',warning:`${clearOld?'Previous EXIF metadata cleared;':'Existing metadata retained;'} only entered fields were written. JPEG pixel data is preserved; other metadata blocks may not be retained.`};
      const afterMeta=await readBlobMeta(blob,output.name);
      const checks=['Make','Model','Software','DateTime','DateTimeOriginal','Artist','Copyright','ImageDescription','LensMake','LensModel','GPSLatitude','GPSLongitude'];
      const beforeAfter=checks.map(k=>({field:k,before:current.meta[k] ?? current.meta['EXIF.'+k] ?? null,after:afterMeta[k] ?? afterMeta['EXIF.'+k] ?? null,changed:String(current.meta[k] ?? current.meta['EXIF.'+k] ?? '')!==String(afterMeta[k] ?? afterMeta['EXIF.'+k] ?? '')}));
      patch(current.id,{output,status:'Edited export ready',verification:{before:current.meta,after:afterMeta,checks:beforeAfter}});
      setNotice('Edited JPEG generated and re-scanned. Review the Before / After verification below.');
    }catch(e){console.error('ExifZen JPEG metadata write failed:',e);setNotice(e?.message || 'Could not write JPEG metadata for this file. The original remains unchanged.');}
    finally{setBusy(false);}
  }
  async function batchClean(){
    if(!items.length)return;
    setBusy(true);setNotice('Processing files that this browser can decode…');
    const zip=new JSZip(); let count=0;
    for(const item of items){
      try{const output=await cleanOne(item);patch(item.id,{output,status:'Clean export ready',verification:output.verification});zip.file(output.name,output.blob);count++;}
      catch(e){patch(item.id,{status:'Skipped: '+(e.message||'unsupported format')});}
    }
    if(count){const blob=await zip.generateAsync({type:'blob'});downloadBlob(blob,'exifzen-exports.zip');}
    setBusy(false);setNotice(`${count} file(s) exported to ZIP. Unsupported files were skipped; check each file status.`);
  }
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function downloadCurrent(){if(current?.output)downloadBlob(current.output.blob,current.output.name);}
  function removeItem(id){setItems(old=>{const n=old.filter(x=>x.id!==id);if(active===id)setActive(n[0]?.id||null);return n;});}
  function addCustom(){if(!current||!customKey.trim())return;patch(current.id,{meta:{...current.meta,[`Custom.${customKey.trim()}`]:customValue}});setCustomKey('');setCustomValue('');setNotice('Custom value added to this session report only. It has not been written into the image file.');}
  const report = () => {
    if(!current)return;
    const reportData={file:current.file.name,format:current.file.type,originalSize:current.file.size,metadata:current.meta,output:current.output?{name:current.output.name,size:current.output.blob.size,warning:current.output.warning}:null,note:'Custom.* values are session-only annotations unless explicitly written by a supported metadata editor.'};
    downloadBlob(new Blob([JSON.stringify(reportData,null,2)],{type:'application/json'}),current.file.name+'.metadata-report.json');
  };
  return <div className={dark?'app dark':'app light'}>
    <header className="topbar"><a className="brand" href="#"><span className="mark">EZ<span>·</span></span><span>Exif<span>Zen</span><small>IMAGE METADATA TOOLS</small></span></a><nav><button className={tab==='view'?'nav active':'nav'} onClick={()=>setTab('view')}><Eye size={16}/> View</button><button className={tab==='edit'?'nav active':'nav'} onClick={()=>setTab('edit')}><Pencil size={16}/> Edit</button><button className={tab==='remove'?'nav active':'nav'} onClick={()=>setTab('remove')}><Trash2 size={16}/> Remove</button></nav><button className="icon-button" aria-label="Toggle theme" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button></header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span className="dot"/> PRIVATE BY DESIGN</div><h1>Know what your images<br/><em>carry with them.</em></h1><p>Inspect image details, edit selected JPEG fields, or export a cleaned copy. Your files are processed locally in this browser.</p></div><div className="intro-note"><ShieldCheck size={21}/><span><b>Your files stay here</b><small>No image upload to an ExifZen server.</small></span></div></section>
      <section className="workspace">
        <aside className="side-panel">
          <div className="panel-head"><span>WORKSPACE</span><span>{items.length} FILES</span></div>
          <label className="upload-box"><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.tif,.tiff,image/*" onChange={e=>addFiles(e.target.files)}/><Upload size={23}/><b>{busy?'Working…':'Add images'}</b><span>Drop files here or browse</span><small>JPEG · PNG · WebP · HEIC · AVIF · TIFF</small></label>
          <div className="file-list">{items.map(it=><div key={it.id} role="button" tabIndex={0} className={'file-row '+(active===it.id?'selected':'')} onClick={()=>setActive(it.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setActive(it.id)}}><img src={it.preview} alt="" onError={e=>{e.currentTarget.style.display='none'}}/><span className="file-name"><b>{it.file.name}</b><small>{bytes(it.file.size)} · {it.status}</small></span><button className="remove-file" onClick={e=>{e.stopPropagation();removeItem(it.id)}} aria-label={'Remove '+it.file.name}><X size={14}/></button></div>)}</div>
          {items.length>1&&<button className="secondary full" disabled={busy} onClick={batchClean}><Layers size={16}/> Clean supported files + ZIP</button>}
          <div className="privacy-card"><LockKeyhole size={18}/><div><b>Local processing</b><p>Files aren't sent to a server. Some formats depend on browser capabilities.</p></div></div>
        </aside>
        <section className="main-panel">
          {!current?<div className="empty-state"><div className="empty-icon"><FileImage size={30}/></div><h2>Start with an image</h2><p>Choose one or more files to inspect their available metadata.</p><label className="button primary"><Upload size={16}/> Choose images<input type="file" multiple hidden accept="image/*,.heic,.heif,.tif,.tiff" onChange={e=>addFiles(e.target.files)}/></label></div>:
          <>
            <div className="selected-file"><div className="preview"><img src={current.preview} alt="Selected image preview" onError={e=>{e.currentTarget.style.display='none'}}/><ImageIcon size={20}/></div><div className="selected-meta"><span className="eyebrow">SELECTED IMAGE</span><h2>{current.file.name}</h2><p>{bytes(current.file.size)} <span>·</span> {current.file.type||'Unknown MIME type'}</p></div><button className="icon-button" onClick={()=>removeItem(current.id)} aria-label="Remove selected file"><X size={18}/></button></div>
            <div className="tabs"><button className={tab==='view'?'tab active':'tab'} onClick={()=>setTab('view')}>Metadata <span>{entries.length}</span></button><button className={tab==='edit'?'tab active':'tab'} onClick={()=>setTab('edit')}>Edit fields</button><button className={tab==='remove'?'tab active':'tab'} onClick={()=>setTab('remove')}>Clean image</button></div>
            {tab==='view'&&<>{Object.keys(current.meta).some(k=>/gps|latitude|longitude/i.test(k))?<div className="warning"><AlertTriangle size={17}/><span>⚠ Location data may be present in this image. Review GPS fields before sharing.</span></div>:<div className="privacy-card"><ShieldCheck size={18}/><div><b>No GPS location data detected by the available metadata readers</b><p>This does not guarantee the file has no location data in unsupported metadata blocks.</p></div></div>}<div className="section-title"><div><h3>Available metadata</h3><p>Only values found in this file are shown.</p></div><button className="secondary small" onClick={report}><FileText size={15}/> Export report</button></div><div className="metadata-table">{entries.map(([k,v])=><div className="metadata-row" key={k}><span>{pretty(k)}</span><b>{String(v)}</b></div>)}</div><div className="custom-box"><h4><Settings2 size={16}/> Session note</h4><p>Add a custom label to the report. This does not write data into the image.</p><div className="custom-inputs"><input value={customKey} onChange={e=>setCustomKey(e.target.value)} placeholder="Field name"/><input value={customValue} onChange={e=>setCustomValue(e.target.value)} placeholder="Value"/><button className="secondary" onClick={addCustom}>Add note</button></div></div></>}
            {tab==='edit'&&<div className="edit-form"><div className="section-title"><div><h3>Full metadata editor</h3><p>Enter only the values you want written to the exported JPEG.</p></div></div>{!caps?.edit&&<div className="warning"><AlertTriangle size={17}/><span>{caps?.note||'This format is currently read-only for metadata editing.'}</span></div>}<label className="clear-toggle"><input type="checkbox" checked={clearOld} onChange={e=>setClearOld(e.target.checked)}/> Remove existing EXIF fields first</label><label>Phone / Camera Make<input value={metaFields.make} onChange={e=>setMetaField('make',e.target.value)} placeholder="e.g. Samsung, Apple, Canon"/></label><label>Phone / Camera Model<input value={metaFields.model} onChange={e=>setMetaField('model',e.target.value)} placeholder="e.g. Galaxy S24 Ultra"/></label><label>Editing software / tool<input value={metaFields.software} onChange={e=>setMetaField('software',e.target.value)} placeholder="e.g. Adobe Photoshop, Snapseed"/></label><label>Date and time<input value={metaFields.datetime} onChange={e=>setMetaField('datetime',e.target.value)} placeholder="YYYY:MM:DD HH:MM:SS"/></label><label>Artist / Creator<input value={metaFields.artist} onChange={e=>setMetaField('artist',e.target.value)} placeholder="Creator name"/></label><label>Copyright notice<input value={metaFields.copyright} onChange={e=>setMetaField('copyright',e.target.value)} placeholder="Copyright text"/></label><label>Image description<input value={metaFields.description} onChange={e=>setMetaField('description',e.target.value)} placeholder="Description"/></label><label>User comment<input value={metaFields.userComment} onChange={e=>setMetaField('userComment',e.target.value)} placeholder="Additional comment"/></label><label>Date/time original<input value={metaFields.datetimeOriginal} onChange={e=>setMetaField('datetimeOriginal',e.target.value)} placeholder="YYYY:MM:DD HH:MM:SS"/></label><label>Date/time digitized<input value={metaFields.datetimeDigitized} onChange={e=>setMetaField('datetimeDigitized',e.target.value)} placeholder="YYYY:MM:DD HH:MM:SS"/></label><label>Lens make<input value={metaFields.lensMake} onChange={e=>setMetaField('lensMake',e.target.value)} placeholder="Lens manufacturer"/></label><label>Lens model<input value={metaFields.lensModel} onChange={e=>setMetaField('lensModel',e.target.value)} placeholder="Lens model"/></label><label>GPS latitude<input value={metaFields.latitude} onChange={e=>setMetaField('latitude',e.target.value)} placeholder="-90 to 90 decimal degrees"/></label><label>GPS longitude<input value={metaFields.longitude} onChange={e=>setMetaField('longitude',e.target.value)} placeholder="-180 to 180 decimal degrees"/></label><label>GPS altitude (m)<input value={metaFields.altitude} onChange={e=>setMetaField('altitude',e.target.value)} placeholder="Optional altitude"/></label><div className="warning"><AlertTriangle size={17}/><span>Writing and clearing metadata is currently implemented for JPEG files only. These are user-entered values, not proof of the actual device or software. GPS, IPTC/XMP, and non-JPEG writing are not implemented in this editor.</span></div><button className="primary button" disabled={busy||!caps?.edit} onClick={editCurrent}><Pencil size={16}/> {busy?'Working…':'Create edited JPEG'}</button></div>}
            {tab==='remove'&&<div className="remove-panel"><div className="remove-icon"><ShieldCheck size={26}/></div><h3>Make a cleaner copy</h3><p>The original stays untouched. ExifZen re-encodes pixels for supported formats; this may affect quality, color profile, transparency or animation.</p>{caps?.note&&<div className="warning"><AlertTriangle size={17}/><span>{caps.note}</span></div>}<div className="preset-row"><label>Removal preset<select value={preset} onChange={e=>setPreset(e.target.value)}><option value="privacy">Privacy clean — canvas re-encode</option><option value="all">Full clean — canvas re-encode (same method)</option><option value="custom">Custom field selection (not available for non-JPEG)</option></select></label></div>{preset==='custom'&&<div className="warning"><AlertTriangle size={17}/><span>Custom per-field removal is not implemented yet. Choose Privacy clean or Full clean; both use the same canvas re-encode strategy and remove metadata exposed through the re-encoded output.</span></div>}<button className="primary button" disabled={busy||!caps?.remove} onClick={removeCurrent}><Trash2 size={16}/>{busy?'Processing…':'Create clean copy'}</button>{!caps?.remove&&<p className="muted">Cleaning is disabled for this format in this browser build.</p>}</div>}
            {current.verification&&<div className="custom-box"><h4><CheckCircle2 size={16}/> Before / After verification (output re-scanned)</h4><p>Comparison uses metadata exposed by the available browser-side readers. Absence from this scan is not a guarantee that every possible metadata block is absent.</p><div className="metadata-table"><div className="metadata-row"><span>GPS status</span><b>{current.verification.gpsRemoved?'Removed ✓':Object.keys(current.verification.after||{}).some(k=>/gps|latitude|longitude/i.test(k))?'Still detected':'No GPS found in output scan'}</b></div><div className="metadata-row"><span>Metadata keys scanned</span><b>{current.verification.metadataKeysBefore ?? Object.keys(current.verification.before||{}).length} → {current.verification.metadataKeysAfter ?? Object.keys(current.verification.after||{}).filter(k=>!k.startsWith('File.')).length}</b></div>{(current.verification.checks||[]).map(c=><div className="metadata-row" key={c.field}><span>{pretty(c.field)}</span><b>{String(c.before??'—')} → {String(c.after??'—')} {c.changed?'✓':''}</b></div>)}</div></div>}
          {current.output&&<div className="output-card"><CheckCircle2 size={19}/><div><b>{current.status}</b><p>{current.output.name} · {bytes(current.output.blob.size)}</p><small>{current.output.warning}</small></div><button className="primary button" onClick={downloadCurrent}><Download size={16}/> Download</button></div>}
          </>}
          {notice&&<div className="notice" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
        </section>
      </section>
      <section className="bottom-grid"><div><span className="eyebrow">FORMAT-AWARE BY DEFAULT</span><h2>Honest about what each file can do.</h2><p>Reading metadata is different from writing or removing it. ExifZen enables only the operations that are implemented for the selected format and browser.</p></div><div className="format-grid">{Object.entries({JPEG:'View · Edit · Clean',PNG:'View · Clean export',WebP:'View · Conditional clean',HEIC:'View · Browser dependent',AVIF:'View · Conditional clean',TIFF:'View · Read-only'}).map(([k,v])=><div className="format" key={k}><b>{k}</b><span>{v}</span></div>)}</div></section>
    </main>
    <footer><span className="brand footer-brand"><span className="mark">EZ<span>·</span></span><span>Exif<span>Zen</span><small>IMAGE METADATA TOOLS</small></span></span><p>Built for clarity. Designed for privacy.</p><span className="footer-right">Your image. Your choice.</span></footer>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
