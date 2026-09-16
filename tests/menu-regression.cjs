const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
test('lobby tabs switch one panel and support keyboard navigation', () => {
  const panels = [{hidden:false},{hidden:true},{hidden:true}];
  const tabs = panels.map((_,i) => ({
    listeners:{}, attributes:{'aria-controls':String(i)}, tabIndex:i ? -1:0,
    classList:{toggle(){}}, setAttribute(k,v){this.attributes[k]=v;},
    getAttribute(k){return this.attributes[k];}, focus(){this.focused=true;},
    addEventListener(k,f){this.listeners[k]=f;}
  }));
  const start = source.indexOf('      function initLobbyMenu()');
  const end = source.indexOf('      function initEvents()',start);
  const context = vm.createContext({document:{querySelectorAll:()=>tabs,getElementById:id=>panels[+id]}});
  vm.runInContext(source.slice(start,end)+';initLobbyMenu();',context);
  tabs[2].listeners.click();
  assert.deepEqual(panels.map(p=>p.hidden),[true,true,false]);
  assert.equal(tabs[2].attributes['aria-selected'],'true');
  tabs[2].listeners.keydown({key:'ArrowRight',preventDefault(){},stopPropagation(){}});
  assert.deepEqual(panels.map(p=>p.hidden),[false,true,true]);
  assert.equal(tabs[0].focused,true);
  assert.deepEqual(tabs.map(t=>t.tabIndex),[0,-1,-1]);
  tabs[0].listeners.keydown({key:'End',preventDefault(){},stopPropagation(){}});
  assert.equal(panels[2].hidden,false);
});
