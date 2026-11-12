import {mountToolNavigation, managedToolDestination} from './navigation.js';
const id = document.body.dataset.toolView;
const status = document.querySelector('#tool-view-status'), output = document.querySelector('#tool-view-output');
const setup = document.querySelector('#tool-view-setup'), reload = document.querySelector('#tool-view-retry');
const origin = location.origin;
const request = async (route, options) => {
  const response = await fetch(route, options), body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
};
const pause = () => new Promise(resolve => setTimeout(resolve, 250));
async function reloadView() {
  reload.disabled = true;
  try {
    await request(`/api/tools/${encodeURIComponent(id)}/retry`, {method:'POST'});
    for (let attempt = 0; attempt < 40; attempt++) {
      const current = await request(`/api/tools/${encodeURIComponent(id)}/status`);
      if (current.restartRequired) { status.textContent = 'Restart the panel from the menu to use the prepared view. Current work is not stopped automatically.'; return; }
      if (current.state === 'ready') {
        const navigation = await request('/api/navigation'), tool = navigation.tools.find(tool=>tool.id === id);
        if (!tool?.route) throw new Error('This view is no longer selected. Return to Apps.');
        location.replace(managedToolDestination(tool.route, origin));return;
      }
      if (current.state === 'error') throw new Error(current.error || 'The current view is unavailable.');
      status.textContent = 'Checking the current view…';await pause();
    }
    throw new Error('The view is taking longer than expected. Use Reload view to check again.');
  } catch (error) { status.textContent = error.message; }
  finally { reload.disabled = false; }
}
reload.addEventListener('click', reloadView);
setup.addEventListener('click', async () => {
  setup.disabled = true;reload.disabled = true;
  try {
    status.textContent = 'Preparing public services. Cameras and models remain stopped.';
    const job = await request('/api/plugins/setup-bundled', {method:'POST'});
    while (true) {
      const current = (await request('/api/jobs')).jobs.find(current=>current.id === job.id);
      if (!current) throw new Error('Setup job is no longer available. Review Jobs in Apps.');
      output.hidden = false;output.textContent = (current.lines ?? []).join('\n');output.scrollTop = output.scrollHeight;
      if (current.state === 'failed') throw new Error(current.error || 'Public setup failed. Existing state is preserved.');
      if (current.state === 'done') { status.textContent = 'Public setup complete. Restart the panel from the menu to use the prepared view.';break; }
      await pause();
    }
  } catch (error) { status.textContent = error.message; }
  finally { setup.disabled = false;reload.disabled = false; }
});
void request('/api/navigation').then(navigation=>mountToolNavigation(document.querySelector('#panel-menu-button'), document.querySelector('#panel-menu'), {origin,current:id,tools:navigation.tools,discover:false})).catch(()=>mountToolNavigation(document.querySelector('#panel-menu-button'), document.querySelector('#panel-menu'), {origin,current:id,tools:[],discover:false}));
