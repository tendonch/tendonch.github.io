// 全ページ共通の処理（ログイン・編集フォーム・お知らせバー・テーマ切り替え）
    const { SUPABASE_URL = '', SUPABASE_ANON_KEY = '' } = window.SITE_CONFIG || {};

    // ---------- 共通ヘルパー ----------
    const $ = (s, r = document) => r.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };
    const safeIcon = u => {
        if (!u) return '';
        if (/^(https?:)?\/\//.test(u)) return safeUrl(u.startsWith('//') ? 'https:' + u : u);
        return /^[\w\-./%]+$/.test(u) ? u : '';
    };
    const validChId = id => /^UC[\w-]{22}$/.test(id || '');

    // ---------- Supabase ----------
    const sb = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase)
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;


    // 中身が変わったときだけ描き直す（動画の埋め込みが何度も作り直されるのを防ぐ）
    function setHtml(el, html) {
        if (el && el._html !== html) { el._html = html; el.innerHTML = html; }
    }

    // ---------- 共有の状態 ----------
    const state = { announcements: [] };   // ページ側で members / channels などを追加します
    const FORMS = {};                      // ページ側で編集フォームの定義を追加します
    let session = null, isAdmin = false, editMode = false, adminDebug = '';

    async function loadAnnouncements() {
        if (!sb) return;
        const a = await sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
        if (a.error) { console.warn('お知らせを取得できません（SQLを実行済みか確認してください）', a.error.message); state.announcements = []; return; }
        state.announcements = a.data;
    }

    // お知らせ + そのページ固有のデータを読み込み直す
    async function reloadAll() {
        await loadAnnouncements();
        if (typeof loadPageData === 'function') await loadPageData();
        renderAll();
    }

    const NAV = [['index.html', 'トップ'], ['questions.html', '質問受付'], ['datapacks.html', 'データパック配布']];
    function renderNav() {
        const el = $('#siteNav');
        if (!el) return;
        const cur = location.pathname.split('/').pop() || 'index.html';
        el.innerHTML = NAV.map(([href, label]) => `<a href="${href}" class="${href === cur ? 'active' : ''}">${label}</a>`).join('');
    }

    function renderAll() {
        renderAnnounce();
        renderNav();
        renderAdminArea();
        if (typeof renderPage === 'function') renderPage();
    }

    async function checkAdmin() {
        isAdmin = false;
        adminDebug = '';
        if (sb && session) {
            const { data, error } = await sb.rpc('is_admin');
            isAdmin = !error && data === true;
            if (!isAdmin) {
                const ids = (session.user.identities || [])
                    .map(i => `${i.provider}:${(i.identity_data && (i.identity_data.provider_id || i.identity_data.sub)) || '?'}`).join(', ');
                adminDebug = (error ? `エラー: ${error.message} / ` : '') + `ログイン中のID → ${ids}`;
            }
        }
        if (!isAdmin) editMode = false;
    }

    function adminBtns(kind, id) {
        if (!editMode) return '';
        return `<span class="edit-btns">
            <button class="mini-btn" data-act="edit" data-kind="${kind}" data-id="${esc(id)}">編集</button>
            <button class="mini-btn danger" data-act="delete" data-kind="${kind}" data-id="${esc(id)}">削除</button>
        </span>`;
    }

    function renderAdminArea() {
        const el = $('#adminArea');
        if (!sb) { el.innerHTML = ''; return; }
        let h = '';
        if (!session) {
            h = '<button class="mode-toggle" data-act="login">管理者ログイン（Discord）</button>';
        } else {
            if (isAdmin) h += `<button class="mode-toggle ${editMode ? 'active' : ''}" data-act="toggleEdit">${editMode ? '編集モードを終了' : '編集モード'}</button>`;
            h += '<button class="mode-toggle" data-act="logout">ログアウト</button>';
            if (!isAdmin) h += `<p class="admin-note">このDiscordアカウントには管理権限がありません。<br>${esc(adminDebug)}</p>`;
        }
        el.innerHTML = h;
    }

    function renderAnnounce() {
        const el = $('#announceArea');
        const list = state.announcements.filter(a => editMode || a.active);
        if (!list.length && !editMode) { el.innerHTML = ''; return; }
        const addBtn = editMode
            ? '<div class="announce-item add"><button class="mini-btn" data-act="add" data-kind="announcement">＋ お知らせを追加</button></div>' : '';
        const items = list.slice(0, editMode ? 20 : 3).map(a => {
            const date = a.created_at ? new Date(a.created_at).toLocaleDateString('ja-JP') : '';
            const body = `<span class="announce-badge">お知らせ</span><span class="announce-date">${esc(date)}</span><span class="announce-text">${esc(a.message)}</span>`;
            const inner = (a.link_url && !editMode)
                ? `<a class="announce-main" href="${esc(safeUrl(a.link_url))}" target="_blank" rel="noopener">${body}</a>`
                : `<div class="announce-main">${body}</div>`;
            return `<div class="announce-item${a.active ? '' : ' off'}">${inner}${a.active ? '' : '<span class="announce-off">非表示</span>'}${adminBtns('announcement', a.id)}</div>`;
        }).join('');
        el.innerHTML = `<div class="announce-bar">${items}${addBtn}</div>`;
    }

    // ---------- 編集フォーム ----------
    FORMS.announcement = {
        table: 'announcements', listKey: 'announcements', title: 'お知らせ',
        fields: [
            { k: 'message', label: 'お知らせの内容', type: 'textarea', required: true },
            { k: 'link_url', label: 'リンクURL（任意・押したときの移動先）', type: 'text' },
            { k: 'active', label: '表示する', type: 'checkbox' }
        ]
    };


    async function uploadFile(file, bucket, imageOnly) {
        if (imageOnly) {
            if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください');
            if (file.size > 2 * 1024 * 1024) throw new Error('画像は2MB以下にしてください');
        } else if (file.size > 50 * 1024 * 1024) {
            throw new Error('ファイルは50MB以下にしてください（大きいものはURLで指定してください）');
        }
        const safeName = file.name.replace(/[^\w.\-]/g, '_') || 'file';
        const path = `${crypto.randomUUID()}/${safeName}`;
        const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (error) throw error;
        return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }

    function openForm(kind, row) {
        const def = FORMS[kind];
        const values = row ? { ...row } : (kind === 'announcement' ? { active: true } : { color: '#3b82f6', sort_order: 0 });
        if (kind === 'channel') values.links = linksToText(values.links);

        const bg = document.createElement('div');
        bg.className = 'modal-bg';
        const fieldsHtml = def.fields.map(f => {
            const v = values[f.k] ?? '';
            if (f.type === 'checkbox') return `<label style="display:flex;align-items:center;gap:8px;color:var(--text-color);font-size:14px;margin-top:14px"><input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
            let input;
            if (f.type === 'textarea') input = `<textarea data-k="${f.k}">${esc(v)}</textarea>`;
            else if (f.type === 'image' || f.type === 'file') input = `<input type="text" data-k="${f.k}" value="${esc(v)}" placeholder="${f.type === 'image' ? '画像のURL' : 'ダウンロードURL'}（またはファイルを選択）"><input type="file" ${f.type === 'image' ? 'accept="image/*"' : ''} data-file="${f.k}" style="margin-top:6px">`;
            else input = `<input type="${f.type}" data-k="${f.k}" value="${esc(v)}">`;
            return `<label>${esc(f.label)}</label>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}`;
        }).join('');
        bg.innerHTML = `<div class="modal"><h3>${esc(def.title)}を${row ? '編集' : '追加'}</h3>${fieldsHtml}
            <p class="error"></p>
            <div class="actions"><button class="cancel" type="button">キャンセル</button><button class="save" type="button">保存</button></div></div>`;
        document.body.appendChild(bg);

        const close = () => bg.remove();
        $('.cancel', bg).onclick = close;
        bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });

        $('.save', bg).onclick = async () => {
            const btn = $('.save', bg), err = $('.error', bg);
            err.textContent = '';
            btn.disabled = true;
            try {
                const payload = {};
                for (const f of def.fields) {
                    const el = $(`[data-k="${f.k}"]`, bg);
                    let v = f.type === 'checkbox' ? el.checked : el.value.trim();
                    if (f.type === 'image' || f.type === 'file') {
                        const file = $(`[data-file="${f.k}"]`, bg).files[0];
                        if (file) v = await uploadFile(file, f.type === 'image' ? 'icons' : 'files', f.type === 'image');
                    }
                    if (f.required && !v) throw new Error(`${f.label.split('（')[0]}を入力してください`);
                    if (f.type === 'number') v = Number(v) || 0;
                    else if (f.k === 'links') v = textToLinks(v);
                    else if (v === '') v = null;
                    payload[f.k] = v;
                }
                if (kind === 'channel') {
                    if (payload.youtube_channel_id && !validChId(payload.youtube_channel_id)) throw new Error('YouTubeチャンネルIDは「UC」で始まる24文字です');
                    if (!payload.color) payload.color = '#3b82f6';
                }
                const q = row ? sb.from(def.table).update(payload).eq('id', row.id) : sb.from(def.table).insert(payload);
                const { data, error } = await q.select();
                if (error) throw error;
                if (!data || !data.length) throw new Error('保存できませんでした（管理権限を確認してください）');
                await reloadAll();
                close();
            } catch (e) {
                err.textContent = e.message || String(e);
                btn.disabled = false;
            }
        };
    }


    async function deleteRow(kind, id) {
        const def = FORMS[kind];
        if (!confirm(`この${def.title}を削除しますか？`)) return;
        const { data, error } = await sb.from(def.table).delete().eq('id', id).select();
        if (error || !data || !data.length) { alert('削除できませんでした: ' + (error ? error.message : '権限がありません')); return; }
        await reloadAll();
    }


    document.addEventListener('click', async e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const { act, kind, id } = b.dataset;
        if (act === 'login') {
            await sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } });
        } else if (act === 'logout') {
            await sb.auth.signOut();
        } else if (act === 'toggleEdit') {
            editMode = !editMode; renderAll();
        } else if (act === 'add') {
            openForm(kind, null);
        } else if (act === 'edit') {
            const list = state[FORMS[kind].listKey];
            openForm(kind, list.find(r => String(r.id) === id));
        } else if (act === 'delete') {
            deleteRow(kind, id);
        }
    });


    // ---------- テーマ（ライト/ダーク） ----------
    const htmlElement = document.documentElement;
    const toggleBtn = document.getElementById('modeToggleBtn');
    const bgLayer = document.getElementById('bgLayer');
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function savedTheme() {
        try { return localStorage.getItem('theme'); } catch (e) { return null; }
    }
    function isDarkNow() {
        const t = savedTheme();
        return t ? t === 'dark' : darkModeMediaQuery.matches;
    }
    // 背景画像も文字色も、<html data-theme="dark"> の有無だけで決まります（style.css 側）
    function applyTheme() {
        if (isDarkNow()) htmlElement.setAttribute('data-theme', 'dark');
        else htmlElement.removeAttribute('data-theme');
    }

    toggleBtn.addEventListener('click', () => {
        try { localStorage.setItem('theme', isDarkNow() ? 'light' : 'dark'); } catch (e) {}
        applyTheme();
    });

    // 別のタブで切り替えたとき・「戻る」で戻ってきたとき・OS設定が変わったときも合わせる
    window.addEventListener('storage', e => { if (e.key === 'theme') applyTheme(); });
    window.addEventListener('pageshow', applyTheme);
    darkModeMediaQuery.addEventListener('change', () => { if (!savedTheme()) applyTheme(); });

    // ---------- 起動 ----------
    async function startSite() {
        applyTheme();
        renderAll();                    // まず仮データで表示
        if (!sb) return;
        const { data } = await sb.auth.getSession();
        session = data.session;
        await checkAdmin();
        await reloadAll();
        sb.auth.onAuthStateChange((event, s) => {
            setTimeout(async () => { session = s; await checkAdmin(); renderAll(); }, 0);
        });
    }

