const inputA = document.getElementById('textInput1');
const inputB = document.getElementById('textInput2');
const btn = document.getElementById('fetchBtn');
const compareOutput = document.getElementById('compareOutput');
const filterControls = document.getElementById('filterControls');
const displayModeSwitch = document.getElementById('displayModeSwitch');
const levelMinSelect = document.getElementById('levelMinSelect');
const levelMaxSelect = document.getElementById('levelMaxSelect');
let currentDisplayMode = 'both';
let comparisonSortState = { key: 'name', direction: 'asc' };
let currentComparisonData = null;

function updateDisplayModeFromSwitch() {
  currentDisplayMode = displayModeSwitch.checked ? 'both' : 'all';
  if (currentComparisonData) {
    renderComparison(currentComparisonData.dataA, currentComparisonData.dataB);
  }
}

displayModeSwitch.addEventListener('change', updateDisplayModeFromSwitch);

levelMinSelect.value = '1';
levelMaxSelect.value = '15';

function syncLevelSelectRange() {
  const minValue = Number(levelMinSelect.value);
  const maxValue = Number(levelMaxSelect.value);
  if (minValue > maxValue) {
    if (document.activeElement === levelMinSelect) {
      levelMaxSelect.value = String(minValue);
    } else {
      levelMinSelect.value = String(maxValue);
    }
  }
}

function reRenderCurrentComparison() {
  if (currentComparisonData) {
    renderComparison(currentComparisonData.dataA, currentComparisonData.dataB);
  }
}

levelMinSelect.addEventListener('change', () => {
  syncLevelSelectRange();
  reRenderCurrentComparison();
});

levelMaxSelect.addEventListener('change', () => {
  syncLevelSelectRange();
  reRenderCurrentComparison();
});

function formatCodePoints(text) {
  return Array.from(text, (char) => {
    const codePoint = char.codePointAt(0);
    return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  }).join(', ');
}

const IGNORED_RECORD_FIELDS = new Set([
  'title',
  'dlccode',
  'dlcCode',
  'pattern',
  'floor',
  'floorName',
  'newTab',
  'maxRating',
  'rating',
  'djpower',
  'maxDjpower',
  'updatedAt',
  'maxCombo'
]);

function formatValue(value, depth = 0) {
  const indent = '  '.repeat(depth);

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => `${indent} - ${formatValue(item, depth + 1)}`).join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, item]) => `${indent}${key}: ${formatValue(item, depth + 1)}`)
      .join('\n');
  }

  return String(value);
}

function filterRecordKeys(records) {
  const keys = new Set();
  records.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (!IGNORED_RECORD_FIELDS.has(key)) keys.add(key);
    });
  });
  return Array.from(keys);
}

function createTable(records) {
  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  const keys = filterRecordKeys(records);

  if (keys.length === 0) {
    const message = document.createElement('p');
    message.textContent = '表示できる records データがありません。';
    return message;
  }

  keys.forEach((key) => {
    const th = document.createElement('th');
    th.textContent = key;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  records.forEach((record) => {
    const row = document.createElement('tr');
    keys.forEach((key) => {
      const cell = document.createElement('td');
      const value = record[key];

      if (key === 'score') {
        const score = Number(value);
        if (!Number.isFinite(score) || score === 0) {
          cell.textContent = '-';
        } else {
          cell.textContent = score.toFixed(2);
        }

        if (score === 100) {
          cell.classList.add('score-perfect');
        } else if (record.maxCombo === true) {
          cell.classList.add('score-maxcombo');
        }
        // alignment: center for '-', right for numbers
        if (!Number.isFinite(score) || score === 0) {
          cell.classList.add('cell-center');
        } else {
          cell.classList.add('cell-right');
        }
      } else if (Array.isArray(value)) {
        cell.textContent = value.join(', ');
      } else if (key === 'level') {
        const lvl = value;
        if (lvl === null || lvl === undefined || String(lvl) === '') {
          cell.textContent = '-';
          cell.classList.add('cell-center');
        } else {
          cell.textContent = lvl;
          cell.classList.add('cell-right');
        }
      } else if (typeof value === 'object' && value !== null) {
        cell.textContent = JSON.stringify(value);
      } else {
        cell.textContent = value ?? '';
      }
      row.appendChild(cell);
    });
    table.appendChild(row);
  });

  return table;
}

/* renderData removed — individual A/B displays are disabled per user request */

function buildComparisonRows(dataA, dataB) {
  const recordsA = Array.isArray(dataA.records) ? dataA.records : [];
  const recordsB = Array.isArray(dataB.records) ? dataB.records : [];
  const recordMap = new Map();

  recordsA.forEach((record) => {
    const key = record.name || JSON.stringify(record);
    recordMap.set(key, { a: record, b: null });
  });

  recordsB.forEach((record) => {
    const key = record.name || JSON.stringify(record);
    const existing = recordMap.get(key);
    if (existing) {
      existing.b = record;
    } else {
      recordMap.set(key, { a: null, b: record });
    }
  });

  return Array.from(recordMap.entries()).map(([, pair]) => {
    const aRecord = pair.a;
    const bRecord = pair.b;
    const name = aRecord?.name || bRecord?.name || '-';
    const level = aRecord?.level ?? bRecord?.level ?? '-';
    const scoreA = parseScore(aRecord?.score);
    const scoreB = parseScore(bRecord?.score);
    const diff = scoreA - scoreB;
    const hasBoth = Boolean(aRecord && bRecord);
    return {
      name,
      level,
      scoreA,
      scoreB,
      diff,
      aRecord,
      bRecord,
      hasBoth
    };
  });
}

function filterComparisonRows(rows) {
  const selectedMode = currentDisplayMode;
  const minLevel = Number(levelMinSelect.value);
  const maxLevel = Number(levelMaxSelect.value);

  return rows.filter((row) => {
    const numericLevel = Number(row.level);
    const matchesLevel = Number.isInteger(numericLevel) && numericLevel >= minLevel && numericLevel <= maxLevel;
    const matchesMode = selectedMode === 'both' ? row.hasBoth : true;
    return matchesLevel && matchesMode;
  });
}

function sortComparisonRows(rows) {
  const multiplier = comparisonSortState.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const valueA = a[comparisonSortState.key];
    const valueB = b[comparisonSortState.key];
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return (valueA - valueB) * multiplier;
    }
    return String(valueA).localeCompare(String(valueB), 'ja', { sensitivity: 'base' }) * multiplier;
  });
}

function createComparisonTable(rows) {
  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  const headers = [
    { key: 'level', label: 'level' },
    { key: 'name', label: 'name' },
    { key: 'scoreA', label: 'score A' },
    { key: 'scoreB', label: 'score B' },
    { key: 'diff', label: '(A - B)' }
  ];

  const renderRows = (displayRows) => {
    table.querySelectorAll('tr.data-row').forEach((row) => row.remove());
    displayRows.forEach((rowData) => {
      const row = document.createElement('tr');
      row.className = 'data-row';
      const { name, level, scoreA, scoreB, diff, aRecord, bRecord } = rowData;

      const scoreACell = document.createElement('td');
      if (scoreA === 0) {
        scoreACell.textContent = '-';
        scoreACell.classList.add('cell-center');
      } else {
        scoreACell.textContent = scoreA.toFixed(2);
        scoreACell.classList.add('cell-right');
        if (scoreA === 100) scoreACell.classList.add('score-perfect');
        else if (aRecord && aRecord.maxCombo === true) scoreACell.classList.add('score-maxcombo');
      }

      const scoreBCell = document.createElement('td');
      if (scoreB === 0) {
        scoreBCell.textContent = '-';
        scoreBCell.classList.add('cell-center');
      } else {
        scoreBCell.textContent = scoreB.toFixed(2);
        scoreBCell.classList.add('cell-right');
        if (scoreB === 100) scoreBCell.classList.add('score-perfect');
        else if (bRecord && bRecord.maxCombo === true) scoreBCell.classList.add('score-maxcombo');
      }

      const diffText = diff === 0 ? '0.00' : `${diff > 0 ? '+' : '-'}${Math.abs(diff).toFixed(2)}`;
      const diffCell = document.createElement('td');
      diffCell.textContent = diffText;
      if (diff === 0) {
        diffCell.classList.add('diff-zero');
      } else if (diff > 0) {
        diffCell.classList.add('diff-positive');
      } else {
        diffCell.classList.add('diff-negative');
      }

      const levelCell = document.createElement('td');
      if (level === '-') {
        levelCell.textContent = '-';
        levelCell.classList.add('cell-center');
      } else {
        levelCell.textContent = level;
        levelCell.classList.add('cell-right');
      }

      const nameCell = document.createElement('td');
      nameCell.textContent = name;

      [levelCell, nameCell, scoreACell, scoreBCell, diffCell].forEach((cell) => row.appendChild(cell));
      table.appendChild(row);
    });
  };

  headers.forEach((header) => {
    const th = document.createElement('th');
    th.className = 'sort-header';
    th.innerHTML = `${header.label}<span class="sort-icon">↕</span>`;
    th.addEventListener('click', () => {
      if (comparisonSortState.key === header.key) {
        comparisonSortState.direction = comparisonSortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        comparisonSortState.key = header.key;
        comparisonSortState.direction = 'asc';
      }
      const orderedRows = currentDisplayMode === 'both'
        ? [...sortComparisonRows(rows)].sort((a, b) => Number(b.hasBoth) - Number(a.hasBoth))
        : sortComparisonRows(rows);
      renderRows(orderedRows);
      Array.from(headerRow.children).forEach((cell) => {
        const icon = cell.querySelector('.sort-icon');
        if (icon) icon.textContent = '↕';
      });
      const activeIcon = th.querySelector('.sort-icon');
      if (activeIcon) {
        activeIcon.textContent = comparisonSortState.direction === 'asc' ? '↑' : '↓';
      }
    });
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  const orderedRows = currentDisplayMode === 'both'
    ? [...sortComparisonRows(rows)].sort((a, b) => Number(b.hasBoth) - Number(a.hasBoth))
    : sortComparisonRows(rows);
  renderRows(orderedRows);
  return table;
}

function parseScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

function compareRows(rows) {
  let win = 0;
  let loss = 0;
  let draw = 0;
  let totalDiff = 0;
  let extraA = 0;
  let extraB = 0;

  rows.forEach((row) => {
    const diff = row.scoreA - row.scoreB;
    totalDiff += diff;
    if (diff > 0) win += 1;
    else if (diff < 0) loss += 1;
    else draw += 1;

    if (row.aRecord && !row.bRecord) extraA += 1;
    if (row.bRecord && !row.aRecord) extraB += 1;
  });

  const averageDiff = rows.length > 0 ? totalDiff / rows.length : 0;
  return {
    win,
    loss,
    draw,
    compareCount: rows.length,
    averageDiff,
    extraA,
    extraB
  };
}

function renderComparison(dataA, dataB) {
  currentComparisonData = { dataA, dataB };
  compareOutput.innerHTML = '';

  if (!dataA || !Array.isArray(dataA.records) || !dataB || !Array.isArray(dataB.records)) {
    filterControls.style.display = 'none';
    compareOutput.textContent = '両方のデータに records が必要です。';
    return;
  }

  filterControls.style.display = 'flex';

  // summary (shown above the table)
  const allRows = buildComparisonRows(dataA, dataB);
  const filteredRows = filterComparisonRows(allRows);
  const summary = compareRows(filteredRows);
  const extraMessages = [];
  if (summary.extraA > 0) extraMessages.push(`A にのみ存在するレコード: ${summary.extraA}`);
  if (summary.extraB > 0) extraMessages.push(`B にのみ存在するレコード: ${summary.extraB}`);

  const summaryText = document.createElement('pre');
  summaryText.textContent = `比較対象件数: ${summary.compareCount}\n勝ち: ${summary.win}\n負け: ${summary.loss}\n引き分け: ${summary.draw}\n差分の平均: ${summary.averageDiff.toFixed(2)}${extraMessages.length ? `\n${extraMessages.join('\n')}` : ''}`;
  compareOutput.appendChild(summaryText);

  const tweetButton = document.createElement('button');
  tweetButton.type = 'button';
  tweetButton.className = 'tweet-button';
  tweetButton.textContent = '結果をツイート';
  tweetButton.addEventListener('click', () => {
    const playerA = inputA.value.trim() || 'nwonwowo';
    const playerB = inputB.value.trim() || 'nwonwowo';
    const minLevel = Number(levelMinSelect.value);
    const maxLevel = Number(levelMaxSelect.value);
    const levelRangeText = minLevel === maxLevel ? `レベル: ${minLevel}` : `レベル: ${minLevel}-${maxLevel}`;
    const tweetText = `v-archive Rivalで ${playerA} と ${playerB} を比較しました！\n\n4BUTTON SC / ${levelRangeText} / 比較対象件数: ${summary.compareCount}\n勝ち: ${summary.win} / 負け: ${summary.loss} / 引き分け: ${summary.draw} / 差分の平均: ${summary.averageDiff.toFixed(2)}\n#varchiveRival`;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  });
  compareOutput.appendChild(tweetButton);

  // comparison table (below summary)
  compareOutput.appendChild(createComparisonTable(filteredRows));
}

async function fetchData(inputValue) {
  const url = `https://v-archive.net/api/v2/archive/${encodeURIComponent(inputValue)}/button/4?pattern=SC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

btn.addEventListener('click', async () => {
  const defaultNickname = 'nwonwowo';
  const valueA = inputA.value.trim() || defaultNickname;
  const valueB = inputB.value.trim() || defaultNickname;

  if (inputA.value.trim() === '') {
    inputA.value = defaultNickname;
  }
  if (inputB.value.trim() === '') {
    inputB.value = defaultNickname;
  }

  filterControls.style.display = 'none';
  currentComparisonData = null;
  compareOutput.textContent = '比較中...';

  try {
    const [dataA, dataB] = await Promise.all([fetchData(valueA), fetchData(valueB)]);
    renderComparison(dataA, dataB);
  } catch (err) {
    compareOutput.textContent = `エラーが発生しました: ${err.message}`;
  }
});
