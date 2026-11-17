// Adds a visible Android companion-app entry point without changing the existing login flow.
(() => {
  const installLink = () => {
    const auth = document.getElementById('auth-screen');
    if (!auth || document.getElementById('pv-android-download-card')) return;
    const card = document.createElement('section');
    card.id = 'pv-android-download-card';
    card.style.cssText = 'max-width:440px;margin:18px auto 28px;padding:14px 16px;border:1px solid rgba(108,99,255,.35);border-radius:16px;background:rgba(108,99,255,.08);text-align:center;';
    const title = document.createElement('div');
    title.textContent = '📱 Get the Android companion app';
    title.style.cssText = 'font-weight:800;font-size:14px;margin-bottom:5px;color:var(--text);';
    const copy = document.createElement('p');
    copy.textContent = 'Install the native app for payment-notification capture and background sync.';
    copy.style.cssText = 'font-size:12px;line-height:1.5;color:var(--muted);margin:0 0 10px;';
    const link = document.createElement('a');
    link.href = './android-download.html';
    link.textContent = 'Web & Android download options →';
    link.style.cssText = 'display:inline-block;padding:10px 14px;border-radius:10px;background:var(--accent);color:#fff;text-decoration:none;font-size:12px;font-weight:800;';
    card.append(title, copy, link);
    const authCard = auth.querySelector('.auth-card');
    if (authCard) authCard.after(card);
    else auth.append(card);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installLink, { once: true });
  else installLink();
})();
