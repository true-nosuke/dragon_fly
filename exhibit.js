(() => {
  const exhibitListEl = document.getElementById('exhibit-list');
  const searchInput = document.getElementById('search');
  const typeFilter = document.getElementById('type-filter');
  const sortOrder = document.getElementById('sort-order');
  const resultCountEl = document.getElementById('result-count');

  const typeLabels = {
    store: '模擬店',
    stage: 'ステージ',
    event: 'イベント',
    club_book: '部誌・作品集',
    big_event: '大型企画'
  };

  const HOT_THRESHOLD = 1000; // 人気展示と見なす閲覧数の閾値

  // 1日目/2日目の日付設定（必要に応じて変更）
  // 形式: YYYY-MM-DD
  const DAY1_DATE = '2025-12-16';
  const DAY2_DATE = '2025-12-17';

  let exhibits = [];

  const setBusy = (isBusy) => {
    if (exhibitListEl) {
      exhibitListEl.setAttribute('aria-busy', String(isBusy));
    }
  };

  const formatSchedule = (schedules) => {
    if (!Array.isArray(schedules) || schedules.length === 0) return '';
    return schedules.map((slot) => `${slot.start ?? '-'} - ${slot.end ?? '-'}`).join(' / ');
  };

  const renderSchedules = (item) => {
    const day1 = formatSchedule(item.schedule1);
    const day2 = formatSchedule(item.schedule2);
    if (!day1 && !day2) return '';

    const parts = [];
    if (day1) parts.push(`<p class="meta-value">1日目: ${day1}</p>`);
    if (day2) parts.push(`<p class="meta-value">2日目: ${day2}</p>`);

    return `<div class="meta-block"><p class="meta-label">開催時間</p>${parts.join('')}</div>`;
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

  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const toDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    const [hh, mm] = String(timeStr).split(':').map((v) => Number(v));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    // ローカルタイムで生成
    const dt = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return null;
    dt.setHours(hh, mm, 0, 0);
    return dt;
  };

  const getStartCandidates = (item) => {
    const dates = [];
    const addFromSchedules = (dateStr, schedules) => {
      if (!Array.isArray(schedules)) return;
      schedules.forEach((slot) => {
        const dt = toDateTime(dateStr, slot?.start);
        if (dt) dates.push(dt);
      });
    };

    addFromSchedules(DAY1_DATE, item?.schedule1);
    addFromSchedules(DAY2_DATE, item?.schedule2);
    return dates;
  };

  const getNearestSortKey = (item, now) => {
    const candidates = getStartCandidates(item).sort((a, b) => a - b);
    if (candidates.length === 0) return { bucket: 2, time: Number.POSITIVE_INFINITY };

    const upcoming = candidates.find((d) => d.getTime() >= now.getTime());
    if (upcoming) return { bucket: 0, time: upcoming.getTime() };

    // 全て過去の場合は「直近の過去」を近い順として扱う
    const lastPast = candidates[candidates.length - 1];
    return { bucket: 1, time: lastPast.getTime() };
  };

  const sortItems = (items) => {
    const mode = sortOrder?.value ?? 'random';
    const list = items.slice();

    if (mode === 'random') {
      return shuffleInPlace(list);
    }

    if (mode === 'popular') {
      return list.sort((a, b) => (b?.viewCount ?? -1) - (a?.viewCount ?? -1));
    }

    if (mode === 'name') {
      return list.sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? '', 'ja'));
    }

    if (mode === 'nearest') {
      const now = new Date();
      return list.sort((a, b) => {
        const ka = getNearestSortKey(a, now);
        const kb = getNearestSortKey(b, now);
        if (ka.bucket !== kb.bucket) return ka.bucket - kb.bucket;
        return ka.time - kb.time;
      });
    }

    return list;
  };

  const renderCards = (items) => {
    if (!exhibitListEl) return;
    exhibitListEl.innerHTML = '';

    if (!items || items.length === 0) {
      exhibitListEl.innerHTML = '<p class="empty">条件に合う展示がありません。検索条件を変えてお試しください。</p>';
      if (resultCountEl) resultCountEl.textContent = '0件';
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      const card = document.createElement('article');
      const isHot = item.viewCount && item.viewCount >= HOT_THRESHOLD;
      card.className = `card type-${item.type ?? 'other'}${isHot ? ' hot-exhibit' : ''}`;
      card.setAttribute('data-type', item.type ?? '');

      const typeLabel = typeLabels[item.type] ?? 'その他';
      const schedulesHtml = renderSchedules(item);
      const menusHtml = renderMenus(item.menus);
      const rainingHtml = renderRaining(item.raining);

      const detailHref = `detail.html?id=${encodeURIComponent(item.id ?? '')}`;

      card.innerHTML = `
        <div class="card-header">
          <span class="pill type">${typeLabel}</span>
          ${isHot ? '<span class="pill hot-badge">たくさんの人が見ています</span>' : ''}
          <p class="club">${item.club ?? 'クラブ情報なし'}</p>
        </div>
        <h2 class="title"><a class="detail-link" href="${detailHref}">${item.name ?? '名称未設定'}</a></h2>
        <p class="desc">${item.description ?? '説明がまだありません。'}</p>
        <div class="meta-row">
          <div class="meta-block">
            <p class="meta-label">場所</p>
            <p class="meta-value">${item.location ?? '未定'}</p>
            ${rainingHtml}
          </div>
          ${schedulesHtml}
        </div>
        ${menusHtml}
        <div class="card-actions">
          <a class="detail-button" href="${detailHref}">詳細を見る</a>
        </div>
      `;

      fragment.appendChild(card);
    });

    exhibitListEl.appendChild(fragment);
    if (resultCountEl) resultCountEl.textContent = `${items.length}件`;
  };

  const normalize = (value) => (value ?? '').toString().toLowerCase();

  const applyFilters = () => {
    const term = normalize(searchInput?.value).trim();
    const selectedType = typeFilter?.value ?? 'all';

    const filtered = exhibits.filter((item) => {
      const matchesType = selectedType === 'all' ? true : item.type === selectedType;
      const haystack = [
        item.name,
        item.club,
        item.description,
        item.location,
        item.type,
        Array.isArray(item.menus) ? item.menus.map((m) => m.name).join(' ') : ''
      ]
        .map(normalize)
        .join(' ');

      const matchesSearch = term ? haystack.includes(term) : true;
      return matchesType && matchesSearch;
    });

    const sorted = sortItems(filtered);
    renderCards(sorted);
  };

  const loadExhibits = async () => {
    if (!exhibitListEl) return;
    setBusy(true);
    try {
      const res = await fetch('data.json');
      if (!res.ok) throw new Error(`データの取得に失敗しました: ${res.status}`);
      const data = await res.json();
      exhibits = Array.isArray(data) ? data : [];
      applyFilters();
    } catch (error) {
      console.error(error);
      exhibitListEl.innerHTML = '<p class="error">データを読み込めませんでした。時間をおいて再度お試しください。</p>';
      if (resultCountEl) resultCountEl.textContent = '-';
    } finally {
      setBusy(false);
    }
  };

  const init = () => {
    if (!exhibitListEl) return;
    searchInput?.addEventListener('input', applyFilters);
    typeFilter?.addEventListener('change', applyFilters);
    sortOrder?.addEventListener('change', applyFilters);
    loadExhibits();
  };

  init();
})();
