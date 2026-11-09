import {iconSvg} from '/design-system.js';
const $ = selector => document.querySelector(selector);
const dialog = $('dialog'), token = location.hash.slice(1);
let snapshot, working = true, stopped = false;
$('.xrb-progress-check').innerHTML = iconSvg('check-circle');
$('.xrb-progress-error').innerHTML = iconSvg('error-circle');
dialog.showModal();
async function api(route, method = 'GET') {
  const response = await fetch(route, {method, headers:{authorization:`Bearer ${token}`}, cache:'no-store'});
  const body = await response.json(); if (!response.ok) throw Error(body.error || `Startup request failed (${response.status})`); return body;
}
function render(state) {
  snapshot = state; working = !['failed','ready'].includes(state.state);
  const failed = state.state === 'failed';
  $('.xrb-progress-status-icon').dataset.state = failed ? 'failed' : state.state === 'ready' ? 'done' : 'running';
  $('#startup-title').textContent = failed ? 'XR Build could not start' : state.state === 'installing' ? 'Installing app dependencies' : state.state === 'starting' ? 'Starting XR Build' : state.state === 'ready' ? 'Opening XR Build' : 'Checking XR Build';
  $('#startup-message').textContent = state.message;
  $('#startup-core').textContent = state.core ? `Core: ${state.core}` : '';
  $('#startup-log').textContent = state.logFile ? `Startup log: ${state.logFile}` : '';
  const output = $('#startup-output'), following = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
  output.textContent = state.output || 'Waiting for output…'; if (following) output.scrollTop = output.scrollHeight;
  $('#startup-retry').hidden = !failed; $('#startup-close').disabled = working;
  $('#startup-hint').textContent = failed ? 'Fix the reported problem, then choose Retry.' : 'You can close this tab; setup keeps running. Reopen the shortcut to return.';
}
function disconnected(error) {
  render({...snapshot, state:'failed', message:`Cannot reach setup: ${error.message}. Reopen the shortcut to reconnect.`, output:snapshot?.output || ''});
  $('#startup-retry').hidden = true;
}
dialog.addEventListener('cancel', event => { if (working) event.preventDefault(); });
$('#startup-retry').addEventListener('click', async () => {
  $('#startup-retry').disabled = true;
  try { await api('/api/retry','POST'); } catch (error) { disconnected(error); }
  finally { $('#startup-retry').disabled = false; }
});
$('#startup-copy').addEventListener('click', async () => {
  const content = `${snapshot?.message || ''}\n${snapshot?.logFile || ''}\n${snapshot?.output || ''}`;
  try { await navigator.clipboard.writeText(content); $('#startup-copy').textContent = 'Copied'; }
  catch { $('#startup-output').focus(); const range = document.createRange(); range.selectNodeContents($('#startup-output')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); $('#startup-hint').textContent = 'Output selected. Copy it with your keyboard.'; }
});
$('#startup-close').addEventListener('click', async () => {
  try { await api('/api/close','POST'); stopped = true; dialog.close(); $('main p').textContent = 'Setup closed. You can close this tab or reopen the shortcut to try again.'; }
  catch (error) { disconnected(error); }
});
async function follow() {
  try {
    const state = await api('/api/state'); render(state);
    if (state.state === 'ready') {
      const destination = new URL(state.url);
      if (destination.protocol !== 'http:' || destination.hostname !== '127.0.0.1' || !destination.port || destination.pathname !== '/' || destination.search || destination.hash || destination.username || destination.password) throw Error('Invalid panel destination');
      stopped = true; await api('/api/close','POST'); location.replace(destination.href); return;
    }
    if (state.state === 'waiting') {
      // Let the modal paint before work begins; repeated/reloaded requests cannot restart it.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await api('/api/start','POST');
    }
  } catch (error) { disconnected(error); }
  if (!stopped) setTimeout(follow, 350);
}
if (/^[a-f0-9]{64}$/.test(token)) void follow();
else { stopped = true; disconnected(Error('Invalid setup session. Reopen the shortcut.')); }
