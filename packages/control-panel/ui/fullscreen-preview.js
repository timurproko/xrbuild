const params = new URLSearchParams(location.search);
const route = params.get('route');
const token = params.get('token');
const session = params.get('session');
let target = null;
try {
  target = new URL(params.get('target'));
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(target.hostname.toLowerCase())) target = null;
} catch { target = null; }

if (!target || !route?.startsWith('/preview/') || !token) {
  document.body.textContent = 'Invalid preview address.';
} else {
  const frame = document.querySelector('#preview');
  frame.src = target.href;
  const channel = new BroadcastChannel('xrb-preview-projection');
  channel.onmessage = (event) => {
    if (event.data?.route !== route) return;
    frame.contentWindow?.postMessage({ ...event.data, token }, target.origin);
  };
  let closing = false;
  const closeRequest = async (event) => {
    const data = event.data;
    if (closing || event.source !== frame.contentWindow || ![target.origin, location.origin].includes(event.origin)
      || data?.type !== 'xrb-preview-close' || data.route !== route || data.token !== token || !session || data.session !== session) return;
    closing = true;
    try {
      await fetch('/api/preview/close', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ route, token, session }) });
    } catch { /* A closed/restarted owner cannot be controlled by this page. */ }
    finally { closing = false; }
  };
  addEventListener('message', closeRequest);
  addEventListener('beforeunload', () => { channel.close(); removeEventListener('message', closeRequest); }, { once: true });
}
