(() => {
  const detailEl = document.getElementById('detail');

  const typeLabels = {
    store: '模擬店',
    stage: 'ステージ',
    event: 'イベント',
    club_book: '部誌・作品集',
    big_event: '大型企画'
  };

  const setBusy = (isBusy) => {
    if (detailEl) detailEl.setAttribute('aria-busy', String(isBusy));
  };

  const getIdFromUrl = () => {
    // 1) 通常: detail.html?id=store_1
    const params = new URLSearchParams(window.location.search);
    const idFromQuery = params.get('id');
    if (idFromQuery) return idFromQuery;

    // 2) ハッシュ: detail.html#id=store_1 or detail.html#store_1
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const idFromHashParam = hashParams.get('id');
      if (idFromHashParam) return idFromHashParam;
      return hash;
    }

    // 3) 誤入力対策: detail.html&id=store_1 のような形式（URL末尾から抽出）
    const href = window.location.href;
    const marker = '&id=';
    const idx = href.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(href.slice(idx + marker.length).split(/[&#?]/)[0]);
    }

    return '';
  };

  const formatSchedule = (schedules) => {
    if (!Array.isArray(schedules) || schedules.length === 0) return '';
    return schedules.map((slot) => `${slot.start ?? '-'} - ${slot.end ?? '-'}`).join(' / ');
  };

  const renderRaining = (raining) => {
    if (!raining) return '';
    const status = raining.isRaining ? `${raining.isRaining}` : '未定';
    const location = raining.location ? ` / ${raining.location}` : '';
    return `<p class="meta-note">雨天: ${status}${location}</p>`;
  };

  const renderMenus = (menus) => {
    if (!Array.isArray(menus) || menus.length === 0) return '';
    const items = menus
      .map((menu) => {
        const name = menu.name ?? 'メニュー';
        const price = menu.price != null ? `${menu.price}円` : '';
        return `<li><span>${name}</span>${price ? `<span class="price">${price}</span>` : ''}</li>`;
      })
      .join('');

    return `<div class="menu-block"><p class="meta-label">メニュー</p><ul class="menu-list">${items}</ul></div>`;
  };

  const renderDetail = (item) => {
    const typeLabel = typeLabels[item.type] ?? 'その他';
    const day1 = formatSchedule(item.schedule1);
    const day2 = formatSchedule(item.schedule2);

    const scheduleHtml = day1 || day2
      ? `<div class="meta-row">
          <div class="meta-block">
            <p class="meta-label">開催時間</p>
            ${day1 ? `<p class="meta-value">1日目: ${day1}</p>` : ''}
            ${day2 ? `<p class="meta-value">2日目: ${day2}</p>` : ''}
          </div>
        </div>`
      : '';

    const viewCountHtml = item.viewCount != null
      ? `<div class="meta-row">
          <div class="meta-block">
            <p class="meta-label">閲覧数（デバッグ）</p>
            <p class="meta-value">${item.viewCount}件</p>
          </div>
        </div>`
      : '';

    return `
      <article class="card detail-card" data-type="${item.type ?? ''}">
        <div class="card-header">
          <span class="pill type">${typeLabel}</span>
          <p class="club">${item.club ?? 'クラブ情報なし'}</p>
        </div>
        <h2 class="title">${item.name ?? '名称未設定'}</h2>
        <p class="desc">${item.description ?? '説明がまだありません。'}</p>

        <div class="meta-row">
          <div class="meta-block">
            <p class="meta-label">場所</p>
            <p class="meta-value">${item.location ?? '未定'}</p>
            ${renderRaining(item.raining)}
          </div>
        </div>

        ${scheduleHtml}
        ${renderMenus(item.menus)}
        <!--${viewCountHtml}-->

        <p class="meta-note">ID: ${item.id ?? '-'}</p>
      </article>
    `;
  };

  const load = async () => {
    if (!detailEl) return;

    const id = getIdFromUrl();
    if (!id) {
      detailEl.innerHTML = '<p class="error">IDが指定されていません。例: <strong>detail.html?id=store_1</strong></p>';
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('data.json');
      if (!res.ok) throw new Error(`データの取得に失敗しました: ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      const found = items.find((x) => x && x.id === id);

      if (!found) {
        detailEl.innerHTML = `<p class="error">指定されたIDの展示が見つかりませんでした: <strong>${id}</strong></p>`;
        return;
      }

      detailEl.innerHTML = renderDetail(found);
    } catch (error) {
      console.error(error);
      detailEl.innerHTML = '<p class="error">データを読み込めませんでした。時間をおいて再度お試しください。</p>';
    } finally {
      setBusy(false);
    }
  };

  load();
})();
