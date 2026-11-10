import assert from 'node:assert/strict';
import {test} from 'node:test';
import {monitorNames,listMonitors} from '../src/monitors.ts';

const screen={index:0,device:'\\\\.\\DISPLAY5',name:'',primary:true,width:1920,height:1080};
test('monitor labels preserve routing identities and indices while naming confirmed internal panels',()=>{
  const [monitor]=monitorNames({...screen,internal:true,name:'Hardware panel code'});
  assert.deepEqual(monitor,{...screen,internal:true,name:'Built-in display'});
});
test('external friendly names are kept even on a primary screen, without guessing laptop topology',()=>{
  const monitors=monitorNames([{...screen,name:'Example panel',internal:false},{...screen,index:1,device:'\\\\.\\DISPLAY2',name:'Second panel',primary:false}]);
  assert.deepEqual(monitors.map(({name,device,index})=>({name,device,index})),[{name:'Example panel',device:screen.device,index:0},{name:'Second panel',device:'\\\\.\\DISPLAY2',index:1}]);
});
test('missing, generic or technical monitor names use readable fallbacks without exposing GDI paths',()=>{
  for(const name of ['',screen.device,'\\\\.\\DISPLAY8','Generic PnP Monitor','Generic Non-PnP Monitor','Generic Monitor','Default Monitor','Monitor']){
    assert.equal(monitorNames({...screen,name})[0].name,'Primary display');
    assert.equal(monitorNames({...screen,name,index:2,primary:false})[0].name,'Display 3');
  }
  assert.equal(monitorNames({...screen,name:'  Example panel\u0000  '})[0].name,'Example panel');
});
test('a cloned GDI source is not mislabeled as one physical internal panel',()=>{
  assert.equal(monitorNames({...screen,internal:true,mirrored:true,name:'Panel'})[0].name,'Mirrored displays');
});
test('invalid probe rows are discarded and singleton Windows JSON remains supported',()=>{
  assert.deepEqual(monitorNames(null),[]);assert.deepEqual(monitorNames([null,{},'bad',{...screen,index:-1},{...screen,width:'1920'}]),[]);
  assert.equal(monitorNames(screen).length,1);
});
test('Windows display enumeration returns human-readable labels without changing monitor configuration', {skip:process.platform!=='win32',timeout:15000},async()=>{
  const monitors=await listMonitors();
  for(const monitor of monitors){assert.ok(monitor.name);assert.notEqual(monitor.name,monitor.device);assert.ok(Number.isInteger(monitor.index));}
});
