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

    const NAV = [['./', 'トップ', 'index.html'], ['questions.html', '質問受付', 'questions.html'], ['datapacks.html', 'データパック等', 'datapacks.html'], ['people.html', '他のページ', 'people.html']];
    function renderNav() {
        const el = $('#siteNav');
        if (!el) return;
        const cur = location.pathname.split('/').pop() || 'index.html';
        el.innerHTML = NAV.map(([href, label, file]) => `<a href="${href}" class="${(file === cur || (file === 'people.html' && cur === 'page.html')) ? 'active' : ''}">${label}</a>`).join('');
    }

    function renderAll() {
        renderAnnounce();
        renderNav();
        const sb_ = $('#settingsBtn');
        if (sb_) sb_.className = 'settings-btn' + (editMode ? ' editing' : '');
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

    // ---------- 他のページ（people.html / page.html で共通） ----------
    const randomSlug = () => Math.random().toString(36).slice(2, 10).padEnd(8, 'x');
    FORMS.page = {
        table: 'pages', listKey: 'pages', title: 'ページ', defaults: { sort_order: 0 },
        fields: [
            { k: 'title', label: 'ページの名前', type: 'text', required: true },
            { k: 'slug', label: 'アドレス名（英小文字・数字・ハイフン。空なら自動）', type: 'text', hint: '例: petra → page.html?p=petra 。あとから変えるとリンクが変わります' },
            { k: 'description', label: '紹介文（任意）', type: 'textarea' },
            { k: 'link_url', label: 'リンク先（任意）: 自分で作ったHTMLのファイル名やURL', type: 'text', hint: '入れると、一覧からこのページの代わりにそこへ移動します。例: game.html（同じフォルダに置いたファイル）や https://…' },
            { k: 'icon_url', label: 'アイコン（任意）', type: 'image' },
            { k: 'bg_light_url', label: '背景（ライトモード用・任意）', type: 'image', maxMB: 10 },
            { k: 'bg_dark_url', label: '背景（ダークモード用・任意）', type: 'image', maxMB: 10 },
            { k: 'sort_order', label: '表示順（小さいほど上）', type: 'number' }
        ],
        validate(p) {
            if (!p.slug) p.slug = randomSlug();
            if (!/^[a-z0-9-]{2,40}$/.test(p.slug)) throw new Error('アドレス名は、英小文字・数字・ハイフンの2〜40文字にしてください');
        }
    };

    // ---------- 編集フォーム ----------
    FORMS.announcement = {
        table: 'announcements', listKey: 'announcements', defaults: { active: true }, title: 'お知らせ',
        fields: [
            { k: 'message', label: 'お知らせの内容', type: 'textarea', required: true },
            { k: 'link_url', label: 'リンクURL（任意・押したときの移動先）', type: 'text' },
            { k: 'active', label: '表示する', type: 'checkbox' }
        ]
    };


    async function uploadFile(file, bucket, imageOnly, maxMB = 2) {
        if (imageOnly) {
            if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください');
            if (file.size > maxMB * 1024 * 1024) throw new Error(`画像は${maxMB}MB以下にしてください`);
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
        const values = row ? { ...row } : (def.defaults ? { ...def.defaults } : { color: '#3b82f6', sort_order: 0 });

        const bg = document.createElement('div');
        bg.className = 'modal-bg';
        const fieldsHtml = def.fields.map(f => {
            const raw = values[f.k];
            const v = f.toText ? f.toText(raw) : (raw ?? '');
            if (f.type === 'checkbox') return `<label style="display:flex;align-items:center;gap:8px;color:var(--text-color);font-size:14px;margin-top:14px"><input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
            if (f.type === 'checks') {
                const cur = Array.isArray(raw) ? raw : [];
                return `<label>${esc(f.label)}</label><div data-k="${f.k}" data-checks="1">` + f.options.map(([val, lab]) =>
                    `<label style="display:inline-flex;align-items:center;gap:6px;margin:4px 14px 0 0;color:var(--text-color);font-size:14px"><input type="checkbox" value="${esc(val)}" ${cur.includes(val) ? 'checked' : ''}> ${esc(lab)}</label>`).join('') + '</div>';
            }
            let input;
            if (f.type === 'select') input = `<select data-k="${f.k}">` + (typeof f.options === 'function' ? f.options() : f.options).map(([val, lab]) => `<option value="${esc(val)}" ${val === (raw ?? '') ? 'selected' : ''}>${esc(lab)}</option>`).join('') + '</select>';
            else if (f.type === 'textarea' || f.type === 'lines' || f.type === 'files') input = `<textarea data-k="${f.k}">${esc(v)}</textarea>` + (f.type === 'files' ? `<input type="file" multiple data-files="${f.k}" style="margin-top:6px">` : '');
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
                    if (f.type === 'checks') {
                        payload[f.k] = [...el.querySelectorAll('input:checked')].map(i => i.value);
                        if (f.required && !payload[f.k].length) throw new Error(`${f.label.split('（')[0]}を選んでください`);
                        continue;
                    }
                    if (f.type === 'lines' || f.type === 'files') {
                        const arr = f.fromText(el.value);
                        if (f.type === 'files') {
                            for (const file of $(`[data-files="${f.k}"]`, bg).files) {
                                arr.push({ name: file.name, url: await uploadFile(file, 'files', false) });
                            }
                        }
                        if (f.required && !arr.length) throw new Error(`${f.label.split('（')[0]}を入力してください`);
                        payload[f.k] = arr;
                        continue;
                    }
                    let v = f.type === 'checkbox' ? el.checked : el.value.trim();
                    if (f.type === 'image' || f.type === 'file') {
                        const file = $(`[data-file="${f.k}"]`, bg).files[0];
                        if (file) v = await uploadFile(file, f.type === 'image' ? 'icons' : 'files', f.type === 'image', f.maxMB);
                    }
                    if (f.required && !v) throw new Error(`${f.label.split('（')[0]}を入力してください`);
                    if (f.type === 'number') v = Number(v) || 0;
                    else if (v === '') v = null;
                    payload[f.k] = v;
                }
                if (kind === 'channel') {
                    if (payload.youtube_channel_id && !validChId(payload.youtube_channel_id)) throw new Error('YouTubeチャンネルIDは「UC」で始まる24文字です');
                    if (!payload.color) payload.color = '#3b82f6';
                }
                if (def.validate) def.validate(payload);
                if (!row && def.extra) Object.assign(payload, await def.extra(payload));
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

    // 別のタブで切り替えたとき・「戻る」で戻ってきたとき・OS設定が変わったときも合わせる
    window.addEventListener('storage', e => { if (e.key === 'theme') applyTheme(); });
    window.addEventListener('pageshow', applyTheme);
    darkModeMediaQuery.addEventListener('change', () => { if (!savedTheme()) applyTheme(); });

    // ---------- 設定（右上の歯車） ----------
    const GEAR = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

    function initSettingsButton() {
        if ($('#settingsBtn')) return;
        const b = document.createElement('button');
        b.id = 'settingsBtn';
        b.className = 'settings-btn';
        b.type = 'button';
        b.setAttribute('aria-label', '設定');
        b.innerHTML = GEAR;
        b.onclick = openSettings;
        document.body.appendChild(b);
    }

    function openSettings() {
        const bg = document.createElement('div');
        bg.className = 'modal-bg';
        const cur = savedTheme() || 'system';
        const radios = [['system', 'システムに合わせる'], ['dark', 'ダークモード'], ['light', 'ライトモード']].map(([v, l]) =>
            `<label class="set-radio"><input type="radio" name="themeMode" value="${v}" ${cur === v ? 'checked' : ''}> ${l}</label>`).join('');
        let acct = '';
        if (sb) {
            acct = '<label>管理者</label>';
            if (!session) {
                acct += '<button class="set-btn" type="button" data-set="login">管理者ログイン（Discord）</button>';
            } else {
                if (isAdmin) {
                    acct += `<button class="set-btn on" type="button" data-set="edit">${editMode ? '編集モードを終了' : '編集モード'}</button>
                             <button class="set-btn" type="button" data-set="stats">アクセス統計を見る</button>`;
                    acct += '<a class="set-btn" href="page.html?p=manual" style="text-decoration:none;text-align:center;box-sizing:border-box">管理者マニュアル</a>';
                } else {
                    acct += `<div class="hint">このDiscordアカウントには管理権限がありません。<br>${esc(adminDebug)}</div>`;
                }
                acct += '<button class="set-btn" type="button" data-set="logout">ログアウト</button>';
            }
        }
        bg.innerHTML = `<div class="modal"><h3>設定</h3><label>表示モード</label>${radios}${acct}
            <div class="actions"><button class="cancel" type="button">閉じる</button></div></div>`;
        document.body.appendChild(bg);
        const close = () => bg.remove();
        $('.cancel', bg).onclick = close;
        bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
        for (const r of bg.querySelectorAll('input[name="themeMode"]')) {
            r.onchange = () => {
                try { if (r.value === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', r.value); } catch (e) {}
                applyTheme();
            };
        }
        bg.addEventListener('click', async e => {
            const b = e.target.closest('[data-set]');
            if (!b) return;
            const act = b.dataset.set;
            if (act === 'login') {
                await sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname } });
            } else if (act === 'logout') {
                await sb.auth.signOut();
                close();
            } else if (act === 'edit') {
                editMode = !editMode;
                renderAll();
                close();
            } else if (act === 'stats') {
                close();
                openStats();
            }
        });
    }

    // ---------- アクセス統計（管理者のみ） ----------
    const PAGE_LABELS = { 'index.html': 'トップ', 'questions.html': '質問受付', 'datapacks.html': 'データパック等', 'people.html': '他のページ一覧' };
    const pageLabel = p => PAGE_LABELS[p] || (p.startsWith('page.html?p=') ? '他のページ: ' + p.slice(12) : p);
    const jstDay = offset => new Date(Date.now() - offset * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

    function niceMax(m) {
        const p = Math.pow(10, Math.floor(Math.log10(m)));
        const n = m / p;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
    }

    function statsHtml(data, days) {
        const map = new Map(((data && data.daily) || []).map(d => [d.day, d]));
        const list = [];
        for (let i = days - 1; i >= 0; i--) {
            const day = jstDay(i), d = map.get(day) || {};
            list.push({ day, visitors: d.visitors || 0, views: d.views || 0 });
        }
        const top = niceMax(Math.max(1, ...list.map(d => Math.max(d.visitors, d.views))));
        const W = 640, H = 240, L = 34, R = 8, T = 10, B = 28, iw = W - L - R, ih = H - T - B, step = iw / days;
        const bw = Math.max(2, step * 0.65);
        const x = i => L + step * i + step / 2;
        const y = v => T + ih - (v / top) * ih;
        let svg = `<svg class="st-svg" viewBox="0 0 ${W} ${H}">`;
        for (let k = 0; k <= 4; k++) {
            const v = top * k / 4;
            svg += `<line class="st-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="st-txt" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`;
        }
        const every = Math.ceil(days / 6);
        list.forEach((d, i) => {
            svg += `<rect class="st-bar" x="${x(i) - bw / 2}" y="${y(d.visitors)}" width="${bw}" height="${T + ih - y(d.visitors)}"><title>${d.day}  訪問者 ${d.visitors} / 表示 ${d.views}</title></rect>`;
            if (i === 0 || i === days - 1 || i % every === 0) svg += `<text class="st-txt" x="${x(i)}" y="${H - 10}" text-anchor="middle">${d.day.slice(5).replace('-', '/')}</text>`;
        });
        svg += `<polyline class="st-line" points="${list.map((d, i) => `${x(i)},${y(d.views)}`).join(' ')}"/></svg>`;

        const sumV = list.reduce((a, d) => a + d.visitors, 0), sumW = list.reduce((a, d) => a + d.views, 0);
        const pages = ((data && data.pages) || []), maxW = Math.max(1, ...pages.map(p => p.views));
        return `<div class="st-cards">
                <div class="st-card"><b>${list[list.length - 1].visitors}</b>今日の訪問者</div>
                <div class="st-card"><b>${(sumV / days).toFixed(1)}</b>1日平均の訪問者</div>
                <div class="st-card"><b>${sumW}</b>期間の表示回数</div></div>
            <div class="st-legend"><span class="st-dot" style="background:var(--accent-group)"></span>訪問者（1日ごと）<span class="st-dot" style="background:var(--accent-tendon)"></span>表示回数</div>
            ${svg}
            <label>よく見られているページ</label>
            ${pages.length ? pages.map(p => `<div class="st-row"><span>${esc(pageLabel(p.path))}</span><div class="st-meter"><i style="width:${(p.views / maxW * 100).toFixed(0)}%"></i></div><span>${p.views}回 / ${p.visitors}人</span></div>`).join('') : '<div class="hint">まだデータがありません</div>'}
            <div class="hint">「訪問者」は、同じブラウザを1日1人として数えています。自分（管理者）やlocalhostでの閲覧は数えません。</div>`;
    }

    function openStats() {
        const bg = document.createElement('div');
        bg.className = 'modal-bg';
        bg.innerHTML = '<div class="modal" style="max-width:680px"><h3>アクセス統計</h3><div id="stPeriod"></div><div id="stBody">読み込み中…</div><div class="actions"><button class="cancel" type="button">閉じる</button></div></div>';
        document.body.appendChild(bg);
        let days = 30;
        const chips = () => { $('#stPeriod', bg).innerHTML = '<div class="chips">' + [7, 30, 90].map(n => `<button class="chip${n === days ? ' on' : ''}" data-days="${n}">${n}日</button>`).join('') + '</div>'; };
        const load = async () => {
            chips();
            const body = $('#stBody', bg);
            body.innerHTML = '読み込み中…';
            const { data, error } = await sb.rpc('get_stats', { p_days: days });
            if (error) { body.textContent = '取得できませんでした（SQLを実行済みか確認してください）: ' + error.message; return; }
            body.innerHTML = statsHtml(data, days);
        };
        bg.addEventListener('click', e => {
            const c = e.target.closest('[data-days]');
            if (c) { days = Number(c.dataset.days); load(); }
        });
        $('.cancel', bg).onclick = () => bg.remove();
        bg.addEventListener('mousedown', e => { if (e.target === bg) bg.remove(); });
        load();
    }

    // ---------- アクセスの記録（1ブラウザ・1ページ・1日につき1回） ----------
    async function trackView() {
        if (!sb || isAdmin) return;
        const h = location.hostname;
        if (h === 'localhost' || h === '127.0.0.1' || location.protocol === 'file:') return;
        try {
            const file = location.pathname.split('/').pop() || 'index.html';
            const slug = (new URLSearchParams(location.search).get('p') || '').slice(0, 40);
            const path = file === 'page.html' && slug ? `page.html?p=${slug}` : file;
            const day = jstDay(0);
            const key = `pv:${day}:${path}`;
            if (localStorage.getItem(key)) return;
            for (let i = localStorage.length - 1; i >= 0; i--) {         // 古い記録を掃除
                const k = localStorage.key(i);
                if (k && k.startsWith('pv:') && !k.startsWith(`pv:${day}:`)) localStorage.removeItem(k);
            }
            let vid = localStorage.getItem('visitorId');
            if (!vid) { vid = crypto.randomUUID(); localStorage.setItem('visitorId', vid); }
            localStorage.setItem(key, '1');
            await sb.from('page_views').insert({ path, visitor: vid });
        } catch (e) {}
    }

    // ---------- 起動 ----------
    async function startSite() {
        // アドレスバーの「/index.html」を「/」に整える（トップページのアドレスをすっきりさせる）
        if (/\/index\.html$/.test(location.pathname)) {
            try { history.replaceState(null, '', location.pathname.replace(/index\.html$/, '') + location.search + location.hash); } catch (e) {}
        }
        applyTheme();
        initSettingsButton();
        renderAll();                    // まず仮データで表示
        if (!sb) return;
        const { data } = await sb.auth.getSession();
        session = data.session;
        await checkAdmin();
        await reloadAll();
        trackView();
        sb.auth.onAuthStateChange((event, s) => {
            setTimeout(async () => { session = s; await checkAdmin(); renderAll(); }, 0);
        });
    }

