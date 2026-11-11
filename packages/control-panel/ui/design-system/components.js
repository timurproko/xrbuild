import {enhanceSelects, enhanceHelpText, installDropdowns, installNumberSteppers, installTabs, installTooltips, installIcons, openFloating, setRevealed} from '/design-system.js';
import {menuKeyboard} from '/navigation.js';
import {rebuildProgressDialog} from '/rebuild-dialog.js';
// All examples stay in this document; even accidental case fetches must not reach a backend.
window.fetch = async () => { throw new TypeError('Component examples have no API operations.'); };
const icons=['folder','settings','rewind','open','play','pause','stop','search','close','code','copy','trash','camera','reset','fullscreen','exit-fullscreen','check-circle','error-circle'];
for(const name of icons){
  const button=document.createElement('button');button.type='button';button.className='xrb-icon-button';button.dataset.xrbIcon=name;button.setAttribute('aria-label',name);document.querySelector('#icon-samples').append(button);
}
for(const name of ['none','blue','green','amber','red','purple','teal','grey']){
  const button=document.createElement('button');button.type='button';button.className='xrb-swatch';button.dataset.swatch=name;button.setAttribute('aria-label',name);button.setAttribute('aria-pressed',String(name==='blue'));document.querySelector('#example-swatches').append(button);
}
enhanceSelects(document);installDropdowns(document);installNumberSteppers(document);installTabs(document);installTooltips(document);installIcons(document);enhanceHelpText(document);
document.querySelectorAll('.xrb-segmented,.xrb-swatch-group,.xrb-choice-list').forEach(group=>group.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  group.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
}));
document.querySelectorAll('.xrb-filter-chip').forEach(button=>button.addEventListener('click',()=>button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'))));
const range=document.querySelector('#example-range');
const rangeValue=()=>range.style.setProperty('--range-progress',`${range.value}%`);range.addEventListener('input',rangeValue);rangeValue();
const tabs=document.querySelector('[role=tablist]');
tabs.addEventListener('click',event=>{
  const selected=event.target.closest('[role=tab]');if(!selected)return;
  tabs.querySelectorAll('[role=tab]').forEach(tab=>{tab.setAttribute('aria-selected',String(tab===selected));tab.tabIndex=tab===selected?0:-1;});
  const panel=document.querySelector('#example-panel');panel.textContent=selected.id==='example-tab-one'?'Overview panel':'Details panel';panel.setAttribute('aria-labelledby',selected.id);
});
const menu=document.querySelector('#example-menu'),menuButton=document.querySelector('#example-menu-button');
const closeMenu=()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');};
menuButton.addEventListener('click',()=>{if(!menu.hidden){closeMenu();return;}openFloating(menu,{anchor:menuButton});menuButton.setAttribute('aria-expanded','true');});
menu.addEventListener('keydown',event=>menuKeyboard(event,menu,()=>{closeMenu();menuButton.focus();}));
menu.addEventListener('click',()=>{closeMenu();menuButton.focus();});
document.addEventListener('click',event=>{if(!menu.contains(event.target)&&!menuButton.contains(event.target))closeMenu();});
const dialog=document.querySelector('#example-dialog');
document.querySelectorAll('[data-demo-dialog]').forEach(button=>button.addEventListener('click',()=>{
  const kind=button.dataset.demoDialog;
  document.querySelector('#example-dialog-title').textContent=button.textContent;
  document.querySelector('#example-dialog-description').textContent=kind==='confirm'?'Confirm this local example?':kind==='question'?'Enter an example value.':'This is a message dialog.';
  document.querySelector('#example-dialog-field').hidden=kind!=='question';
  dialog.showModal();
}));
dialog.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
const progress=rebuildProgressDialog({storage:null,onViewJob:()=>{}});
document.querySelectorAll('[data-demo-progress]').forEach(button=>button.addEventListener('click',()=>{
  const job={id:1,state:button.dataset.demoProgress,kind:'desktop-setup',title:'install example components',lines:['Local component example. No process is running.'],error:button.dataset.demoProgress==='failed'?'Example operation could not complete.':null};
  progress.show(job);
  if(job.state==='running')setTimeout(()=>progress.render({...job,state:'done'}),1200);
}));
document.querySelector('#example-reveal').addEventListener('click',event=>{
  const button=event.currentTarget,visible=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(visible));setRevealed(document.querySelector('#example-reveal-content'),visible);
});
document.querySelector('#example-copy').addEventListener('click',async()=>{
  const status=document.querySelector('#example-copy-status');
  try{await navigator.clipboard.writeText(document.querySelector('#example-output').textContent);status.textContent='Copied.';}catch{status.textContent='Select the output to copy it.';}
});
const section=new URLSearchParams(location.search).get('state');
if(section&&section!=='all')document.getElementById(section)?.scrollIntoView();
document.documentElement.dataset.fixtureReady='true';
