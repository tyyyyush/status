/*
 * Статус-страница FatVPN. Схема status.json — ops/status-watch/status_watch.py,
 * public_status(); решения — docs/status-page-2026-11-06.md (В4, В6, В7, В13).
 *
 * Страница ходит ровно в один адрес: status.json рядом с собой. К .29 и к
 * любым другим нашим серверам не обращается: когда сборщик молчит, она по
 * возрасту данных сама пишет «сбой у нас» (В6).
 *
 * Логика (buildModel и т. п.) не трогает DOM, её проверяет
 * site/status/tests/status.test.js под Node.
 */
(function () {
	'use strict';

	var STRINGS = {
		ru: {
			title: 'FatVPN — статус',
			brandSub: 'статус',
			langLabel: 'Язык',
			loading: 'Загружаем статус…',
			state_ok: 'Всё работает',
			state_minor: 'Частичный сбой',
			state_major: 'Серьёзный сбой',
			state_unknown: 'Пока нет данных',
			state_stale: 'Данные устарели',
			state_nodata: 'Не удалось загрузить статус',
			problems: 'Не работает: {list}',
			detail_stale: 'Наша проверка давно не присылала данных — значит, сбой у нас, и мы уже знаем. Ниже — последнее, что мы видели.',
			detail_nodata: 'Попробуйте обновить страницу через минуту.',
			detail_unknown: 'Проверка только запустилась — данные появятся в ближайшие минуты.',
			updated: 'Обновлено {age}',
			justNow: 'только что',
			minAgo: ['{n} минуту назад', '{n} минуты назад', '{n} минут назад'],
			hourAgo: ['{n} час назад', '{n} часа назад', '{n} часов назад'],
			dayAgo: ['{n} день назад', '{n} дня назад', '{n} дней назад'],
			noticeTitle: 'Объявление',
			servicesTitle: 'Сервисы',
			serversTitle: 'Серверы',
			svc_app: 'Приложение',
			svc_bot: 'Telegram-бот',
			svc_payment: 'Оплата',
			svcNote_payment: 'Сбой на стороне платёжной системы, а не у нас. Попробуйте оплатить позже.',
			st_working: 'Работает',
			st_partial: 'Частичный сбой',
			st_down: 'Не работает',
			st_unknown: 'Нет данных',
			serverCount: ['{n} сервер', '{n} сервера', '{n} серверов'],
			upOf: 'работает {up} из {total}',
			checkedFrom: 'Проверяем из Москвы каждые 5 минут, страница обновляется раз в 10 минут. На мобильном интернете может быть иначе.',
			autoRefresh: 'Страница обновляется сама.'
		},
		en: {
			title: 'FatVPN — status',
			brandSub: 'status',
			langLabel: 'Language',
			loading: 'Loading status…',
			state_ok: 'All systems operational',
			state_minor: 'Partial outage',
			state_major: 'Major outage',
			state_unknown: 'No data yet',
			state_stale: 'Status is out of date',
			state_nodata: 'Could not load the status',
			problems: 'Not working: {list}',
			detail_stale: 'Our checks have not reported for a while, so the problem is on our side and we already know. Below is the last state we saw.',
			detail_nodata: 'Please reload the page in a minute.',
			detail_unknown: 'Checks have just started; data will appear within a few minutes.',
			updated: 'Updated {age}',
			justNow: 'just now',
			minAgo: ['{n} min ago', '{n} min ago'],
			hourAgo: ['{n} hour ago', '{n} hours ago'],
			dayAgo: ['{n} day ago', '{n} days ago'],
			noticeTitle: 'Announcement',
			servicesTitle: 'Services',
			serversTitle: 'Servers',
			svc_app: 'App',
			svc_bot: 'Telegram bot',
			svc_payment: 'Payments',
			svcNote_payment: 'The payment provider is having problems, not us. Please try again later.',
			st_working: 'Operational',
			st_partial: 'Partial outage',
			st_down: 'Down',
			st_unknown: 'No data',
			serverCount: ['{n} server', '{n} servers'],
			upOf: '{up} of {total} up',
			checkedFrom: 'Checked from Moscow every 5 minutes; this page refreshes every 10 minutes. Mobile networks may differ.',
			autoRefresh: 'This page refreshes by itself.'
		}
	};

	var DEFAULT_STALE_SEC = 1800;  // как STALE_AFTER_SEC у сторожа
	var LANG_KEY = 'fatvpn-status-lang';
	// Языки, носителям которых по умолчанию показываем русский.
	var RU_FIRST = /^(ru|uk|be|kk|ky|uz|tg|hy|az|ka|tk)\b/;

	function fill(s, vars) {
		return String(s).replace(/\{(\w+)\}/g, function (m, k) {
			return vars && vars[k] != null ? String(vars[k]) : m;
		});
	}

	function pluralIndex(n, lang) {
		if (lang === 'ru') {
			var d = n % 10, h = n % 100;
			if (d === 1 && h !== 11) return 0;
			if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 1;
			return 2;
		}
		return n === 1 ? 0 : 1;
	}

	function plural(forms, n, lang) {
		return fill(forms[Math.min(pluralIndex(n, lang), forms.length - 1)], { n: n });
	}

	function pickLang(search, stored, navLangs) {
		var m = /[?&]lang=(ru|en)(?:&|$)/.exec(search || '');
		if (m) return m[1];
		if (stored === 'ru' || stored === 'en') return stored;
		var first = navLangs && navLangs.length ? String(navLangs[0]).toLowerCase() : '';
		if (!first || RU_FIRST.test(first)) return 'ru';
		return 'en';
	}

	function ageSec(updatedAt, nowMs) {
		var t = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN;
		if (isNaN(t)) return null;
		return Math.max(0, Math.round((nowMs - t) / 1000));
	}

	function formatAge(sec, lang) {
		var t = STRINGS[lang];
		if (sec < 60) return t.justNow;
		var min = Math.floor(sec / 60);
		if (min < 60) return plural(t.minAgo, min, lang);
		var h = Math.floor(min / 60);
		if (h < 48) return plural(t.hourAgo, h, lang);
		return plural(t.dayAgo, Math.floor(h / 24), lang);
	}

	// Сборщик пишет online/offline у серверов и working/partial/down у групп.
	function norm(s) {
		if (s === 'online' || s === 'working') return 'working';
		if (s === 'offline' || s === 'down') return 'down';
		if (s === 'partial') return 'partial';
		return 'unknown';
	}

	// Порядок в списке серверов (просьба владельца 10.11): сверху то, что работает,
	// ниже — частично, потом «нет данных», в самом низу — то, что не работает.
	var STATUS_RANK = { working: 0, partial: 1, unknown: 2, down: 3 };

	function flag(code) {
		return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65);
	}

	/*
	 * Флаги рисуем сами (решение 06.11). Windows не показывает флаги-эмодзи (там
	 * вместо флага буквы «DE»), а чужие наборы картинок и шрифтов — это чужие
	 * лицензии и обязанность указывать авторов. Сами государственные флаги —
	 * общественное достояние, а эти SVG написаны здесь: вопросов с лицензией нет.
	 *
	 * Каждый флаг нарисован в своих пропорциях и на странице вписывается в рамку
	 * 4:3 с обрезкой краёв (slice). Страны без рисунка показываются эмодзи: на
	 * телефоне это флаг, на Windows — буквы. Новая страна во флоте — добавить сюда.
	 */
	var SVG_NS = 'http://www.w3.org/2000/svg';

	function n3(x) { return Math.round(x * 1000) / 1000; }

	function rect(x, y, w, h, c) {
		return '<rect x="' + n3(x) + '" y="' + n3(y) + '" width="' + n3(w) + '" height="' + n3(h) +
			'" fill="' + c + '"/>';
	}

	// Полосы в рамке 24×18: горизонтальные ('h') или вертикальные ('v'); weights — доли.
	function stripes(dir, colors, weights) {
		weights = weights || colors.map(function () { return 1; });
		var total = weights.reduce(function (a, b) { return a + b; }, 0);
		var size = dir === 'h' ? 18 : 24, at = 0, body = '';
		colors.forEach(function (c, i) {
			var len = size * weights[i] / total;
			body += dir === 'h' ? rect(0, at, 24, len, c) : rect(at, 0, len, 18, c);
			at += len;
		});
		return { box: '0 0 24 18', body: body };
	}

	// Скандинавский крест в официальных единицах флага: фон и слои [цвет, x, толщина].
	function nordic(w, h, bg, layers) {
		var body = rect(0, 0, w, h, bg);
		layers.forEach(function (l) {
			body += rect(l[1], 0, l[2], h, l[0]) + rect(0, (h - l[2]) / 2, w, l[2], l[0]);
		});
		return { box: '0 0 ' + w + ' ' + h, body: body };
	}

	function star(cx, cy, r, rotDeg) {
		var pts = [];
		for (var i = 0; i < 10; i++) {
			var a = (rotDeg + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.382 : r;
			pts.push(n3(cx + rr * Math.cos(a)) + ',' + n3(cy + rr * Math.sin(a)));
		}
		return pts.join(' ');
	}

	function triangle(cx, cy, r, rotDeg) {
		var pts = [];
		for (var i = 0; i < 3; i++) {
			var a = (rotDeg + i * 120) * Math.PI / 180;
			pts.push(n3(cx + r * Math.cos(a)) + ',' + n3(cy + r * Math.sin(a)));
		}
		return pts.join(' ');
	}

	function usFlag() {
		var body = '';
		for (var i = 0; i < 13; i++) body += rect(0, i * 50, 1235, 50, i % 2 ? '#FFFFFF' : '#B22234');
		body += rect(0, 0, 494, 350, '#3C3B6E');
		for (var row = 1; row <= 9; row++) {
			for (var col = 1; col <= 11; col++) {
				if ((row + col) % 2 === 0) {
					body += '<polygon fill="#FFFFFF" points="' + star(494 / 12 * col, 35 * row, 20, -90) + '"/>';
				}
			}
		}
		return { box: '0 0 1235 650', body: body, align: 'xMinYMid' };
	}

	var FLAGS = {
		// Наш флот на 06.11.2026: DE, FI, LT, NL, NO, PL.
		DE: stripes('h', ['#000000', '#DD0000', '#FFCE00']),
		FI: nordic(18, 11, '#FFFFFF', [['#002F6C', 5, 3]]),
		LT: stripes('h', ['#FDB913', '#006A44', '#C1272D']),
		NL: stripes('h', ['#AE1C28', '#FFFFFF', '#21468B']),
		NO: nordic(22, 16, '#BA0C2F', [['#FFFFFF', 6, 4], ['#00205B', 7, 2]]),
		PL: stripes('h', ['#FFFFFF', '#DC143C']),
		// Частые страны VPN-нод.
		AE: { box: '0 0 24 18', body: rect(0, 0, 6, 18, '#FF0000') + rect(6, 0, 18, 6, '#00732F') +
			rect(6, 6, 18, 6, '#FFFFFF') + rect(6, 12, 18, 6, '#000000') },
		AM: stripes('h', ['#D90012', '#0033A0', '#F2A800']),
		AT: stripes('h', ['#C8102E', '#FFFFFF', '#C8102E']),
		BE: stripes('v', ['#000000', '#FDDA24', '#EF3340']),
		BG: stripes('h', ['#FFFFFF', '#00966E', '#D62612']),
		CH: { box: '0 0 32 32', body: rect(0, 0, 32, 32, '#DA291C') + rect(13, 6, 6, 20, '#FFFFFF') +
			rect(6, 13, 20, 6, '#FFFFFF') },
		CZ: { box: '0 0 30 20', body: rect(0, 0, 30, 10, '#FFFFFF') + rect(0, 10, 30, 10, '#D7141A') +
			'<polygon fill="#11457E" points="0,0 15,10 0,20"/>' },
		DK: nordic(37, 28, '#C8102E', [['#FFFFFF', 12, 4]]),
		EE: stripes('h', ['#0072CE', '#000000', '#FFFFFF']),
		// Гражданский флаг Испании — без герба, это официальный вариант.
		ES: stripes('h', ['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1]),
		FR: stripes('v', ['#002654', '#FFFFFF', '#CE1126']),
		GB: { box: '0 0 60 30', body:
			'<clipPath id="s"><path d="M0,0 v30 h60 v-30 z"/></clipPath>' +
			'<clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>' +
			'<g clip-path="url(#s)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/>' +
			'<path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" stroke-width="6"/>' +
			'<path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/>' +
			'<path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" stroke-width="10"/>' +
			'<path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g>' },
		GR: (function () {
			var body = '';
			for (var i = 0; i < 9; i++) body += rect(0, i * 2, 27, 2, i % 2 ? '#FFFFFF' : '#0D5EAF');
			body += rect(0, 0, 10, 10, '#0D5EAF') + rect(4, 0, 2, 10, '#FFFFFF') + rect(0, 4, 10, 2, '#FFFFFF');
			return { box: '0 0 27 18', body: body, align: 'xMinYMid' };
		})(),
		HU: stripes('h', ['#CE2939', '#FFFFFF', '#477050']),
		IE: stripes('v', ['#169B62', '#FFFFFF', '#FF883E']),
		IL: { box: '0 0 220 160', body: rect(0, 0, 220, 160, '#FFFFFF') + rect(0, 15, 220, 25, '#0038B8') +
			rect(0, 120, 220, 25, '#0038B8') +
			'<g fill="none" stroke="#0038B8" stroke-width="5.5">' +
			'<polygon points="' + triangle(110, 80, 32, -90) + '"/>' +
			'<polygon points="' + triangle(110, 80, 32, 90) + '"/></g>' },
		IS: nordic(25, 18, '#02529C', [['#FFFFFF', 7, 4], ['#DC1E35', 8, 2]]),
		IT: stripes('v', ['#009246', '#FFFFFF', '#CE2B37']),
		JP: { box: '0 0 30 20', body: rect(0, 0, 30, 20, '#FFFFFF') + '<circle cx="15" cy="10" r="6" fill="#BC002D"/>' },
		LU: stripes('h', ['#EA141D', '#FFFFFF', '#51ADDA']),
		LV: stripes('h', ['#9E3039', '#FFFFFF', '#9E3039'], [2, 1, 2]),
		RO: stripes('v', ['#002B7F', '#FCD116', '#CE1126']),
		RU: stripes('h', ['#FFFFFF', '#0039A6', '#D52B1E']),
		SE: nordic(16, 10, '#006AA7', [['#FECC02', 5, 2]]),
		TR: { box: '0 0 1200 800', body: rect(0, 0, 1200, 800, '#E30A17') +
			'<circle cx="400" cy="400" r="200" fill="#FFFFFF"/><circle cx="450" cy="400" r="160" fill="#E30A17"/>' +
			'<polygon fill="#FFFFFF" points="' + star(683, 400, 100, 180) + '"/>' },
		UA: stripes('h', ['#0057B7', '#FFD700']),
		US: usFlag()
	};

	function flagSvg(code) {
		var f = Object.prototype.hasOwnProperty.call(FLAGS, code) ? FLAGS[code] : null;
		if (!f) return null;
		return '<svg xmlns="' + SVG_NS + '" width="24" height="18" viewBox="' + f.box +
			'" preserveAspectRatio="' + (f.align || 'xMidYMid') + ' slice">' + f.body + '</svg>';
	}

	function countryName(code, lang) {
		try {
			var n = new Intl.DisplayNames([lang], { type: 'region' }).of(code);
			if (n && n !== code) return n;
		} catch (e) { /* старый браузер */ }
		return code;
	}

	function arr(x) { return Array.isArray(x) ? x : []; }

	/*
	 * Из status.json — всё, что нужно нарисовать. Ничего из файла не попадает
	 * в разметку как HTML: только textContent (объявление пишет человек).
	 */
	function buildModel(data, nowMs, lang) {
		var t = STRINGS[lang];
		if (!data || typeof data !== 'object') return { state: 'nodata' };
		var age = ageSec(data.updatedAt, nowMs);
		if (age === null) return { state: 'nodata' };
		var staleAfter = Number(data.staleAfterSec) > 0 ? Number(data.staleAfterSec) : DEFAULT_STALE_SEC;

		var services = arr(data.services).filter(function (s) {
			return s && typeof s.id === 'string' && /^[a-z][a-z0-9_-]*$/.test(s.id);
		}).map(function (s) {
			var st = norm(s.status);
			var note = st === 'down' ? (t['svcNote_' + s.id] || '') : '';
			return { id: s.id, label: t['svc_' + s.id] || s.id, status: st, note: note };
		});

		var countries = arr(data.countries).filter(function (c) {
			return c && typeof c.code === 'string' && /^[A-Z]{2}$/.test(c.code);
		}).map(function (c) {
			var servers = arr(c.servers).map(function (s) {
				return { name: String((s && s.name) || ''), status: norm(s && s.status) };
			});
			var up = servers.filter(function (s) { return s.status === 'working'; }).length;
			return {
				code: c.code, name: countryName(c.code, lang), flag: flag(c.code),
				status: norm(c.status), up: up, total: servers.length, servers: servers
			};
		});
		countries.sort(function (a, b) {
			return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || a.name.localeCompare(b.name, lang);
		});

		// «Авто-выбора» на странице нет (решение 06.11, как у Sota); старое поле
		// autoSelect в файле, если вдруг придёт, просто не читаем.

		var other = arr(data.other).filter(function (o) {
			return o && typeof o.name === 'string' && o.name.trim();
		}).map(function (o) { return { name: o.name.trim(), status: norm(o.status) }; });

		// Один список «Серверы»: страны и серверы без страны вперемешку, но по
		// статусу. Сортировка устойчивая: при равном статусе страны идут первыми.
		var rows = countries.map(function (c) { return { kind: 'country', item: c }; })
			.concat(other.map(function (o) { return { kind: 'other', item: o }; }));
		rows.sort(function (a, b) { return STATUS_RANK[a.item.status] - STATUS_RANK[b.item.status]; });

		var problems = [];
		services.forEach(function (s) { if (s.status === 'down') problems.push(s.label); });
		countries.forEach(function (c) {
			if (c.status === 'down' || c.status === 'partial') problems.push(c.name);
		});
		other.forEach(function (o) { if (o.status === 'down') problems.push(o.name); });

		var serverGroups = countries.map(function (c) { return c.status; })
			.concat(other.map(function (o) { return o.status; }));
		var known = serverGroups.filter(function (s) { return s !== 'unknown'; });
		var app = services.filter(function (s) { return s.id === 'app'; })[0];
		var allDown = known.length > 0 && known.every(function (s) { return s === 'down'; });
		var nothingKnown = known.length === 0 && services.every(function (s) { return s.status === 'unknown'; });

		var live;
		if ((app && app.status === 'down') || allDown) live = 'major';
		else if (problems.length) live = 'minor';
		else if (nothingKnown) live = 'unknown';
		else live = 'ok';

		var stale = age > staleAfter;
		var notice = typeof data.notice === 'string' && data.notice.trim() ? data.notice.trim() : null;
		return {
			state: stale ? 'stale' : live,
			liveState: live,
			stale: stale,
			age: age,
			updatedAt: data.updatedAt,
			problems: problems,
			services: services,
			countries: countries,
			other: other,
			rows: rows,
			notice: notice
		};
	}

	/*
	 * Откуда брать данные. На проде — только status.json. На localhost для
	 * проверки вёрстки можно подставить сценарий из dev/ (?src=partial):
	 * на настоящем адресе параметр молча игнорируется, чтобы ссылкой нельзя
	 * было показать человеку чужой «статус».
	 */
	function sourceUrl(loc) {
		var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname || '');
		var m = /[?&]src=([a-z0-9-]{1,40})(?:&|$)/.exec(loc.search || '');
		return local && m ? 'dev/' + m[1] + '.json' : 'status.json';
	}

	/*
	 * Что писать в шапке. Общего вердикта («Всё работает» / «Частичный сбой»)
	 * нет — решение владельца 10.11: на странице все серверы, включая лежащие
	 * пулы и выключенные, и вердикт годами висел бы красным. Каждая строка ниже
	 * говорит сама за себя. Шапка остаётся только для того, что про данные, а не
	 * про серверы: загрузка, «устарели», «не загрузились», «пока нет данных».
	 */
	function summaryText(m, t) {
		var live = m.state === 'ok' || m.state === 'minor' || m.state === 'major';
		return {
			cardState: live ? 'live' : m.state,
			headline: live ? '' : m.state === 'loading' ? t.loading : t['state_' + m.state],
			detail: m.state === 'stale' || m.state === 'nodata' || m.state === 'unknown' ? t['detail_' + m.state] : ''
		};
	}

	var api = {
		STRINGS: STRINGS, pickLang: pickLang, plural: plural, pluralIndex: pluralIndex,
		formatAge: formatAge, ageSec: ageSec, norm: norm, flag: flag,
		countryName: countryName, buildModel: buildModel, sourceUrl: sourceUrl,
		flagSvg: flagSvg, FLAGS: FLAGS, summaryText: summaryText
	};
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (typeof document === 'undefined') return;

	// ---------------------------------------------------------------- браузер

	var lang;
	var data = null;
	var dev = sourceUrl(location) !== 'status.json';
	var userOpen = {};   // страны, которые человек раскрыл или свернул сам

	function storedLang() {
		try { return localStorage.getItem(LANG_KEY); } catch (e) { return null; }
	}

	function saveLang(l) {
		try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* приватный режим */ }
	}

	function $(id) { return document.getElementById(id); }

	function el(tag, cls, text) {
		var e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	}

	function pill(status) {
		var p = el('span', 'pill', STRINGS[lang]['st_' + status]);
		p.setAttribute('data-s', status);
		return p;
	}

	function flagImage(code) {
		var svg = flagSvg(code);
		if (!svg) return null;
		var img = document.createElement('img');
		img.className = 'flag';
		img.alt = '';  // название страны стоит рядом
		img.width = 24;
		img.height = 18;
		// Картинка из строки, а не сетевой адрес: страница по-прежнему никуда не ходит.
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
		return img;
	}

	function row(icon, name, sub, note, status) {
		var r = el('div', 'row');
		// icon — строка (эмодзи) или готовый элемент (картинка флага).
		var ic = typeof icon === 'string' ? el('span', 'row-icon', icon) : el('span', 'row-icon');
		if (typeof icon !== 'string') ic.appendChild(icon);
		ic.setAttribute('aria-hidden', 'true');
		r.appendChild(ic);
		var main = el('div', 'row-main');
		main.appendChild(el('div', 'row-name', name));
		if (sub) main.appendChild(el('div', 'row-sub', sub));
		if (note) main.appendChild(el('div', 'row-note', note));
		r.appendChild(main);
		r.appendChild(pill(status));
		return r;
	}

	function chevron() {
		var ns = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('class', 'chev');
		svg.setAttribute('aria-hidden', 'true');
		var p = document.createElementNS(ns, 'path');
		p.setAttribute('d', 'M6 3.5 10.5 8 6 12.5');
		p.setAttribute('fill', 'none');
		p.setAttribute('stroke', 'currentColor');
		p.setAttribute('stroke-width', '1.8');
		p.setAttribute('stroke-linecap', 'round');
		p.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(p);
		return svg;
	}

	function countryItem(c) {
		var t = STRINGS[lang];
		var li = el('li');
		var d = el('details', 'country');
		var open = Object.prototype.hasOwnProperty.call(userOpen, c.code)
			? userOpen[c.code] : (c.status === 'partial' || c.status === 'down');
		d.open = open;
		var sub = c.status === 'partial' || c.status === 'down'
			? fill(t.upOf, { up: c.up, total: c.total })
			: plural(t.serverCount, c.total, lang);
		var s = el('summary', 'row');
		var r = row(flagImage(c.code) || c.flag, c.name, sub, '', c.status);
		while (r.firstChild) s.appendChild(r.firstChild);
		s.appendChild(chevron());
		s.addEventListener('click', function () { userOpen[c.code] = !d.open; });
		d.appendChild(s);
		var ul = el('ul', 'servers');
		c.servers.forEach(function (srv) {
			var item = el('li', 'srv', srv.name);
			item.setAttribute('data-s', srv.status);
			item.title = t['st_' + srv.status];
			ul.appendChild(item);
		});
		d.appendChild(ul);
		li.appendChild(d);
		return li;
	}

	function draw() {
		var t = STRINGS[lang];
		var m = data ? buildModel(data, Date.now(), lang) : { state: data === null && loaded ? 'nodata' : 'loading' };
		document.body.classList.toggle('is-stale', !!m.stale);
		var head = summaryText(m, t);
		$('summary').setAttribute('data-state', head.cardState);
		$('headline').textContent = head.headline;
		$('headline').hidden = !head.headline;
		$('detail').textContent = head.detail;
		$('detail').hidden = !head.detail;

		var up = $('updated');
		up.hidden = m.age == null;
		if (m.age != null) {
			up.textContent = fill(t.updated, { age: formatAge(m.age, lang) });
			up.title = new Date(m.updatedAt).toLocaleString(lang);
		}

		$('notice').hidden = !m.notice;
		$('notice-text').textContent = m.notice || '';

		var svc = $('services');
		svc.textContent = '';
		(m.services || []).forEach(function (s) {
			var li = el('li');
			li.appendChild(row(s.id === 'app' ? '📱' : s.id === 'bot' ? '💬' : s.id === 'payment' ? '💳' : '•',
				s.label, '', s.note, s.status));
			svc.appendChild(li);
		});
		$('services-block').hidden = !svc.childNodes.length;

		var list = $('servers');
		list.textContent = '';
		(m.rows || []).forEach(function (r) {
			if (r.kind === 'country') {
				list.appendChild(countryItem(r.item));
				return;
			}
			var li = el('li');
			li.appendChild(row('🌍', r.item.name, '', '', r.item.status));
			list.appendChild(li);
		});
		$('servers-block').hidden = !list.childNodes.length;
	}

	function applyLang(l) {
		lang = l;
		var t = STRINGS[lang];
		document.documentElement.lang = lang;
		document.title = t.title;
		Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (e) {
			e.textContent = t[e.getAttribute('data-i18n')];
		});
		Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-label]'), function (e) {
			e.setAttribute('aria-label', t[e.getAttribute('data-i18n-label')]);
		});
		Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
			b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang));
		});
		draw();
	}

	var loaded = false;
	var inFlight = false;

	function load() {
		if (inFlight) return;
		inFlight = true;
		var url = sourceUrl(location);
		fetch(url + '?t=' + Date.now(), { cache: 'no-store' })
			.then(function (r) {
				if (!r.ok) throw new Error('HTTP ' + r.status);
				return r.json();
			})
			.then(function (d) {
				// Сценарии из dev/ хранят возраст, а не время — иначе к утру все «устарели».
				if (dev && d && typeof d.devAgeSec === 'number') {
					d.updatedAt = new Date(Date.now() - d.devAgeSec * 1000).toISOString();
				}
				data = d;
			})
			.catch(function () { /* оставляем прошлые данные: их возраст скажет сам за себя */ })
			.then(function () {
				inFlight = false;
				loaded = true;
				draw();
			});
	}

	Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
		b.addEventListener('click', function () {
			var l = b.getAttribute('data-lang');
			saveLang(l);
			applyLang(l);
		});
	});

	applyLang(pickLang(location.search, storedLang(), navigator.languages || [navigator.language]));
	load();
	setInterval(load, 60 * 1000);
	setInterval(draw, 20 * 1000);
	document.addEventListener('visibilitychange', function () {
		if (document.visibilityState === 'visible') load();
	});
})();
