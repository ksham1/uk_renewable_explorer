import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export type SearchOption = { value: string; label: string; detail?: string; searchText: string };

function SearchSelect({label, options, values, onChange, multiple = false}: {
 label: string; options: SearchOption[]; values: string[];
 onChange: (values: string[]) => void; multiple?: boolean;
}) {
 // Draft text belongs to this control only. It never reaches dashboard filters.
 const [query,setQuery] = useState(''), [open,setOpen] = useState(false), [active,setActive] = useState(-1);
 const container = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
 const id = useId();
 const selected = useMemo(() => new Set(values), [values]);
 const byValue = useMemo(() => new Map(options.map(option => [option.value,option])), [options]);
 const matches = useMemo(() => {
  const text = query.trim().toLowerCase(), results: SearchOption[] = [];
  for (const option of options) {
   if (!text || option.searchText.includes(text)) results.push(option);
   if (results.length === 30) break;
  }
  return results;
 },[options,query]);
 useEffect(() => {
  const outside = (event: PointerEvent) => {if(!container.current?.contains(event.target as Node)) setOpen(false);};
  document.addEventListener('pointerdown',outside);
  return () => document.removeEventListener('pointerdown',outside);
 },[]);
 const choose = (value: string) => {
  const next = multiple ? selected.has(value) ? values.filter(v=>v!==value) : [...values,value] : [value];
  onChange(next);
  if(!multiple) {setOpen(false);setQuery('');setActive(-1);}
  input.current?.focus();
 };
 return <div className={`filter-field search-select${multiple?' developer-filter':''}`} ref={container}
  onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
  <label htmlFor={id}>{label}{multiple && <small> · select multiple</small>}</label>
  <div className="search-select-input"><Search size={14}/><input ref={input} id={id} aria-label={label} role="combobox"
   aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
   aria-activedescendant={open&&active>=0?`${id}-option-${active}`:undefined}
   value={query} placeholder={`Find ${multiple?'developers':'a project'}…`}
   onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);}}
   onKeyDown={e=>{
    if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,matches.length-1));}
    else if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(i-1,0));}
    else if(e.key==='Enter'&&open&&active>=0&&matches[active]){e.preventDefault();choose(matches[active].value);}
    else if(e.key==='Escape'){setOpen(false);setActive(-1);}
   }}/>
   {query?<button aria-label={`Clear ${label.toLowerCase()} text`} onClick={()=>{setQuery('');setActive(-1);input.current?.focus();}}><X size={13}/></button>:
    <button aria-label={`Show ${label.toLowerCase()} suggestions`} onClick={()=>{setOpen(!open);if(!open)input.current?.focus();}}><ChevronDown size={13}/></button>}
  </div>
  {open&&<div className="search-select-menu">
   <div className="search-select-hint">{multiple?'Select developers to apply the filter.':'Select a project to apply the filter.'} Typing does not filter projects.</div>
   <div id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`} aria-multiselectable={multiple}>
    {matches.map((option,i)=><button key={option.value} id={`${id}-option-${i}`} role="option" aria-selected={selected.has(option.value)}
     className={active===i?'focused':''} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option.value)}>
     {multiple&&<span className="search-checkbox">{selected.has(option.value)&&<Check size={12}/>}</span>}
     <span><strong>{option.label}</strong>{option.detail&&<small>{option.detail}</small>}</span>
     {!multiple&&selected.has(option.value)&&<Check size={13}/>}
    </button>)}
    {!matches.length&&<p className="search-select-empty">No matching {multiple?'developers':'projects'}.</p>}
   </div>
   <div className="search-select-hint">Up to 30 suggestions. Type more to narrow the list.{multiple&&<button onClick={()=>setOpen(false)}>Done</button>}</div>
  </div>}
  {values.length>0&&<div className="search-selected" aria-label={`Selected ${label.toLowerCase()}`}>
   {values.map(value=><button key={value} title={`Remove ${byValue.get(value)?.label||value}`} onClick={()=>onChange(values.filter(v=>v!==value))}>
    <span>{byValue.get(value)?.label||value}</span><X size={11}/></button>)}
   {multiple&&values.length>1&&<button className="clear-selections" onClick={()=>onChange([])}>Clear all</button>}
  </div>}
 </div>;
}
export default memo(SearchSelect);
