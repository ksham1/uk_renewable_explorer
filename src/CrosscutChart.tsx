import { memo, useMemo, type CSSProperties } from 'react';
import { BarChart3, X } from 'lucide-react';
import { crosscut, stages, stageColours } from './analysis';
import { formatNumber, shortTech } from './data';
import type { Project } from './types';

function CrosscutChart({projects, technology, status, onTechnology, onStatus, onSegment, onClear}: {
 projects: Project[]; technology: string; status: string;
 onTechnology: (technology: string) => void; onStatus: (stage: string) => void;
 onSegment: (technology: string, stage: string) => void; onClear: () => void;
}) {
 const rows = useMemo(() => crosscut(projects), [projects]);
 const maximum = Math.max(1, ...rows.map(r => r.total));
 const axisMax = Math.max(1, Math.ceil(maximum / 1000 / 4) * 4);
 const total = rows.reduce((sum,r) => sum + r.total,0);
 const missing = rows.reduce((sum,r) => sum + r.missing,0);
 const selected = technology !== 'All' || status !== 'All';
 return <section className="panel crosscut-panel" aria-label="Capacity by technology and development stage">
  <div className="panel-heading"><div><span className="panel-icon"><BarChart3 size={17}/></span><h2>Capacity by technology and development stage</h2></div><span className="unit-label">KNOWN CAPACITY · GW</span></div>
  <p className="crosscut-description">Each bar shows a technology’s reported capacity, split by development stage. Select a segment to filter the directory; other segments remain visible for comparison.</p>
  <div className="stage-totals">{stages.map(stage => {
   const mw = rows.reduce((sum,r) => sum + r.cells[stage].mw,0);
   const count = rows.reduce((sum,r) => sum + r.cells[stage].count,0);
   return <button key={stage} aria-pressed={status === stage} onClick={() => onStatus(stage)} style={{'--stage-colour':stageColours[stage]} as CSSProperties}>
    <span><i style={{background:stageColours[stage]}}/>{stage}</span><strong>{(mw/1000).toFixed(2)} <small>GW</small></strong><span>{formatNumber(count)} projects</span>
   </button>;
  })}<div className="chart-grand-total"><span>All stages</span><strong>{(total/1000).toFixed(2)} <small>GW</small></strong><span>{formatNumber(projects.length)} projects</span></div></div>
  <div className="crosscut-scroll" tabIndex={0} role="region" aria-label="Technology bars; scroll to see all technologies">
   <div className="crosscut-inner"><div className="crosscut-axis"><span>TECHNOLOGY</span><div>{[0,1,2,3,4].map(i=><span key={i} style={{left:`${i*25}%`}}>{(axisMax*i/4).toLocaleString('en-GB')}<small> GW</small></span>)}</div><span>TOTAL · GW</span></div>
   {rows.map(row => {
    let offset = 0;
    return <div className={'crosscut-row'+(technology === row.technology ? ' selected' : '')} key={row.technology}>
     <button className="technology-label" title={row.technology} aria-pressed={technology === row.technology} onClick={() => onTechnology(row.technology)}><span>{shortTech(row.technology)}</span><small>{formatNumber(row.count)} projects{row.missing ? ` · ${row.missing} missing capacity` : ''}</small></button>
     <svg className="crosscut-bar" viewBox="0 0 660 34" role="group" aria-label={`${row.technology}, ${(row.total/1000).toFixed(3)} GW`}>
      {[0,1,2,3,4].map(i=><line key={i} x1={i*165} x2={i*165} y1={0} y2={34} stroke="#273847" strokeDasharray="2 3"/>)}
      {stages.map(stage => {
       const cell = row.cells[stage], x = offset / 1000 / axisMax * 660;
       offset += cell.mw;
       const width = cell.mw/1000/axisMax*660;
       const isSelected = (technology === 'All' || technology === row.technology) && (status === 'All' || status === stage);
       const label = `${row.technology}, ${stage}: ${(cell.mw/1000).toFixed(3)} GW, ${cell.count} projects${cell.missing ? `, ${cell.missing} without reported capacity` : ''}`;
       return cell.mw > 0 ? <g key={stage} role="button" tabIndex={0} aria-label={label} aria-pressed={technology===row.technology&&status===stage}
        onClick={() => onSegment(row.technology,stage)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSegment(row.technology,stage);}}}
        className="chart-segment" style={{opacity:!selected||isSelected?1:0.22}}>
        <title>{label}</title><rect x={x} y={6} width={width} height={22} fill={stageColours[stage]}/>
        {width > 50 && <text x={x+width/2} y={21} textAnchor="middle" fill="#0d1925" fontSize={11} fontWeight={600} pointerEvents="none">{(cell.mw/1000).toFixed(1)}</text>}
       </g> : null;
      })}
      {row.total===0&&<text x={8} y={22} fill="#8da6b8" fontSize={11}>No reported capacity — select the technology label</text>}
     </svg><strong className="crosscut-row-total">{(row.total/1000).toLocaleString('en-GB',{maximumFractionDigits:3})}</strong>
    </div>;
   })}</div>
  </div>
  <div className="crosscut-footer"><span>All {rows.length} technologies included; scroll for additional rows. {formatNumber(missing)} projects have no reported capacity.</span><span>For small segments, select a technology label and a stage heading.</span><span className="chart-context-note">Chart totals reflect search, region, developer and capacity filters. Technology and stage selections filter the directory and map.</span></div>
  {selected&&<div className="chart-selection" role="status"><span>Directory selection: <strong>{technology==='All'?'All technologies':shortTech(technology)}</strong> / <strong>{status==='All'?'All stages':status}</strong></span><button onClick={onClear}><X size={13}/> Clear selection</button></div>}
 </section>;
}
export default memo(CrosscutChart);
