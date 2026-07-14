/**
 * ☯ 陰陽鬼門羅盤・日暦占術 (script.js)
 * 陰陽道の真理、羅盤とコンパスの同期、Web Audioによるお清めの音階、生年月日と日々の五行相性占いを司る。
 */

document.addEventListener('DOMContentLoaded', () => {
    // === 状態管理変数 ===
    let heading = 0; // 現在の方位角 (0-359度)
    let isSensorActive = false; // デバイスセンサーが動作中か
    let sensorPermissionGranted = false; // センサー許可状態
    let activeBarrier = false; // 結界（一時的鬼門封じ）発動フラグ
    let barrierTimer = null;
    let audioCtx = null; // Web Audio API コンテキスト

    // ユーザー生年月日・属性情報
    let userBirthdate = null; // Dateオブジェクト
    let userTankanIdx = null; // 生まれた日の十干インデックス (0-9)
    let userGogyoIdx = null;   // 生まれた日の五行インデックス (0-4)

    // === DOM要素の取得 ===
    const compassDisk = document.getElementById('compass-disk');
    const compassWrapper = document.getElementById('compass-wrapper');
    const angleValue = document.getElementById('angle-value');
    const directionName = document.getElementById('direction-name');
    const directionFortune = document.getElementById('direction-fortune');
    const btnSyncCompass = document.getElementById('btn-sync-compass');
    const sensorStatus = document.getElementById('sensor-status');
    const manualSlider = document.getElementById('manual-slider');
    const bgGlow = document.getElementById('bg-glow');
    const infoTitle = document.getElementById('info-title');
    const infoDesc = document.getElementById('info-desc');
    const infoPanel = document.getElementById('direction-info');
    
    // 日付・属性
    const currentDateEl = document.getElementById('current-date');
    const currentElementEl = document.getElementById('current-element');

    // ユーザープロフィール
    const userProfilePanel = document.getElementById('user-profile-panel');
    const userElementBadge = document.getElementById('user-element-badge');
    const userBirthInfo = document.getElementById('user-birth-info');
    const userElementDesc = document.getElementById('user-element-desc');

    // 設定モーダル
    const settingsModal = document.getElementById('settings-modal');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const selectYear = document.getElementById('birth-year');
    const selectMonth = document.getElementById('birth-month');
    const selectDay = document.getElementById('birth-day');

    // 占い・おみくじ
    const talisman = document.getElementById('talisman');
    const fortuneResult = document.getElementById('fortune-result');
    const fortuneElement = document.getElementById('fortune-element');
    const fortuneText = document.getElementById('fortune-text');

    // お祓い
    const btnPurify = document.getElementById('btn-purify');
    const purifyOverlay = document.getElementById('purify-overlay');

    // === 音響生成 (Web Audio API) ===
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // 神楽鈴の音（しゃんしゃんという高音の金属的な響き）を再現
    function playKaguraBell() {
        initAudio();
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        
        // 3回「しゃん」と鳴らす
        for (let i = 0; i < 3; i++) {
            const timeOffset = now + i * 0.4;
            triggerSingleBell(timeOffset);
        }
    }

    function triggerSingleBell(startTime) {
        const frequencies = [2048, 2560, 3072, 3584, 4096, 5120];
        
        frequencies.forEach((freq) => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            
            // 鈴の揺らぎ（高速ビブラート）
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            lfo.frequency.setValueAtTime(32, startTime);
            lfoGain.gain.setValueAtTime(60, startTime);
            
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            
            // 音量減衰エンベロープ
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.04 / frequencies.length, startTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            lfo.start(startTime);
            osc.start(startTime);
            
            lfo.stop(startTime + 0.4);
            osc.stop(startTime + 0.4);
        });
    }

    // お札をめくるときの和紙の擦れ音
    function playPaperSound() {
        initAudio();
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        const bufferSize = audioCtx.sampleRate * 0.15;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 0.6;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noise.start(now);
        noise.stop(now + 0.15);
    }

    // === 陰陽五行・十干十二支データベース ===
    const elements = [
        { name: '木気', colorClass: 'badge-wood', element: 'wood', desc: '木属性：成長・向上心・慈愛・正義感を象徴す。草木の如く伸びやかで、人を育てる力を宿す。' },
        { name: '火気', colorClass: 'badge-fire', element: 'fire', desc: '火属性：情熱・活発・礼節・明朗さを象徴す。太陽や灯火の如く輝き、周囲を照らす行動力を宿す。' },
        { name: '土気', colorClass: 'badge-earth', element: 'earth', desc: '土属性：包容力・誠実・信用・堅実さを象徴す。大地や山岳の如くどっしり構え、万物を受け入れる。' },
        { name: '金気', colorClass: 'badge-metal', element: 'metal', desc: '金属性：正義・変革・果断・意志の強さを象徴す。鋼鉄や宝石の如く硬質で、鋭い判断力とこだわりを宿す。' },
        { name: '水気', colorClass: 'badge-water', element: 'water', desc: '水属性：智慧・自由・柔軟・流動性を象徴す。大河や雨露の如く柔軟に形を変え、深い思慮と知識を宿す。' }
    ];

    const jukkan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const tankanNames = [
        '甲 (木の兄・きのえ)', '乙 (木の弟・きのと)', 
        '丙 (火の兄・ひのえ)', '丁 (火の弟・ひのと)', 
        '戊 (土の兄・つちのえ)', '己 (土の弟・つちのと)', 
        '庚 (金の兄・かのえ)', '辛 (金の弟・かのと)', 
        '壬 (水の兄・みずのえ)', '癸 (水の弟・みずのと)'
    ];
    const junishi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const rokuyou = ['大安', '赤口', '先勝', '友引', '先負', '仏滅'];

    // 個人の十干ごとの宿命・性格の定義
    const tankanCharacters = [
        '大樹の如き実直さ。正義感が強く曲がったことを嫌い、自ら先頭に立ってぐんぐんと成長を遂げる大器なり。',
        '草花の如き柔軟さと忍耐強さ。逆境に置かれても枯れることなく、人と協調しながら見事な花を咲かせる性質なり。',
        '太陽の如き陽気さと情熱。明朗活発で自己表現力に優れ、そこにあるだけで周囲の人々を明るく暖めるカリスマなり。',
        '灯火や囲炉裏の如き繊細さと内なる熱意。静かで思慮深いが、内に秘めた情熱は強く、芸術や専門分野で人を惹きつける。',
        '大山の如き包容力とどっしりとした風格。誠実で一度決めたことは曲げず、多くの人から信頼を集める指導者の相なり。',
        '田園の土の如き温和さと育成力。多芸多才で吸収力に優れ、人を教育し、穏やかに周囲をサポートする慈愛の心を持つ。',
        '鋼鉄や鋭き刀剣の如き決断力。意志が極めて強く、困難に遭うほどに己を鍛え上げ、現状を力強く変革する行動者なり。',
        '美しい宝石の如き美意識と感性。細部へのこだわりが強く上品だが、ガラスの如く繊細で、磨くほどに独自の光を放つ。',
        '奔流する大河の如き自由さと知恵。ダイナミックな発想力を持ち、型にはまるのを嫌い、常に大局を見据えて動き続ける。',
        '恵みの雨や湧き水の如き母性と深い思慮。地道で忍耐強く、他者にそっと潤いを与える。内省的で高い精神性を宿す。'
    ];

    // === 日付・十干十二支・五行の算出 ===
    function calculateDayTankanShi(targetDate) {
        // 基準日: 1900-01-01 (日干支は「甲戌」: 十干甲=0, 十二支戌=10)
        const baseDate = new Date(1900, 0, 1);
        
        // タイムゾーンによるズレを防ぐためUTC正午で計算
        const utcBase = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
        const utcTarget = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        
        const diffTime = utcTarget - utcBase;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const kanIdx = ((0 + diffDays) % 10 + 10) % 10;
        const shiIdx = ((10 + diffDays) % 12 + 12) % 12;

        return { kanIdx, shiIdx, gogyoIdx: Math.floor(kanIdx / 2) };
    }

    // 本日の属性表示の更新
    function updateDateAndElement() {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const date = today.getDate();
        
        const reiwaYear = year - 2018;
        const reiwaText = reiwaYear > 0 ? `令和${reiwaYear}年` : `西暦${year}年`;
        currentDateEl.innerText = `${reiwaText} ${month}月${date}日`;

        // 今日の日干支と五行
        const todayAttr = calculateDayTankanShi(today);
        const currentElement = elements[todayAttr.gogyoIdx];

        const rokuyouIdx = ((month + date) % 6);
        const currentRokuyou = rokuyou[rokuyouIdx];

        currentElementEl.innerText = `${jukkan[todayAttr.kanIdx]}${junishi[todayAttr.shiIdx]}日 (${currentRokuyou}) / ${currentElement.name}`;
        currentElementEl.className = 'element-badge ' + currentElement.colorClass;

        return {
            tankanIdx: todayAttr.kanIdx,
            gogyoIdx: todayAttr.gogyoIdx,
            dateString: `${month}月${date}日`
        };
    }

    // === 生年月日モーダル・データ管理 ===
    function initSettingsModal() {
        // 年セレクトボックス (1900年〜2026年)
        const currentYear = 2026;
        for (let y = currentYear; y >= 1900; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.innerText = `${y}年`;
            if (y === 1995) opt.selected = true; // デフォルト
            selectYear.appendChild(opt);
        }

        // 月
        for (let m = 1; m <= 12; m++) {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = `${m}月`;
            selectMonth.appendChild(opt);
        }

        // 日
        for (let d = 1; d <= 31; d++) {
            const opt = document.createElement('option');
            opt.value = d;
            opt.innerText = `${d}日`;
            selectDay.appendChild(opt);
        }

        // ロード時に保存データがあれば反映、無ければモーダル表示
        const savedBirth = localStorage.getItem('onmyoji_birthdate');
        if (savedBirth) {
            applyBirthdate(savedBirth);
            btnCloseModal.style.display = 'block'; // 閉じるボタンを表示
        } else {
            // 初回起動時は強制表示
            openModal(true);
        }
    }

    function openModal(isForce = false) {
        settingsModal.classList.add('active');
        if (isForce) {
            btnCloseModal.style.display = 'none';
        } else {
            btnCloseModal.style.display = 'block';
        }
    }

    function closeModal() {
        settingsModal.classList.remove('active');
    }

    function saveSettings() {
        const year = parseInt(selectYear.value);
        const month = parseInt(selectMonth.value);
        const day = parseInt(selectDay.value);

        // 有効な日付かチェック (例：2月31日のような無効日)
        const testDate = new Date(year, month - 1, day);
        if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
            alert("日付が正しくありませぬ。暦に存在する日付をご指定くだされ。");
            return;
        }

        const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        localStorage.setItem('onmyoji_birthdate', dateString);
        applyBirthdate(dateString);
        
        playKaguraBell();
        closeModal();
    }

    function applyBirthdate(dateString) {
        const parts = dateString.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);

        userBirthdate = new Date(year, month - 1, day);

        // 生年月日の日干支と五行属性を算出
        const userAttr = calculateDayTankanShi(userBirthdate);
        userTankanIdx = userAttr.kanIdx;
        userGogyoIdx = userAttr.gogyoIdx;

        const gogyo = elements[userGogyoIdx];

        // 宿命プロフィールの表示更新
        userBirthInfo.innerText = `${year}年 ${month}月 ${day}日生まれ（${tankanNames[userTankanIdx]}）`;
        userElementBadge.innerText = gogyo.name;
        userElementBadge.className = 'element-badge ' + gogyo.colorClass;
        userElementDesc.innerText = tankanCharacters[userTankanIdx] + " " + gogyo.desc;
        userProfilePanel.style.display = 'block';

        // 占いの再生成フラグ（めくった状態なら戻す）
        resetTalisman();
    }

    function resetTalisman() {
        talisman.classList.remove('flipped');
        isTalismanFlipped = false;
    }

    btnOpenSettings.addEventListener('click', () => openModal(false));
    btnCloseModal.addEventListener('click', closeModal);
    btnSaveSettings.addEventListener('click', saveSettings);

    // === 方位吉凶判定データ ===
    const directionData = [
        {
            name: "北（子・坎宮）",
            fortune: "平",
            fortuneClass: "normal",
            desc: "静寂と深い思考を司る方位。学問や隠密なる計画には好適。ただし、冷えと停滞の気があるため、積極的かつ派手な行動は実を結びにくい。内に秘める時期と心得よ。"
        },
        {
            name: "北東（艮・鬼門）",
            fortune: "大凶（鬼門）",
            fortuneClass: "bad",
            desc: "【表鬼門】邪気や悪鬼が出入りするとされる最凶の方位。動土（穴掘りなど）や新規の契約、移転は大凶。常に清浄に保ち、穢れを払うべし。ここを向いての不平不満は災いを招く。"
        },
        {
            name: "東（卯・震宮）",
            fortune: "吉",
            fortuneClass: "good",
            desc: "昇る太陽の如き成長と活力を司る方位。新しいことを開始する、または遠方との連絡に絶大なる吉。進取の精神をもって挑めば、青龍の加護を得られん。"
        },
        {
            name: "南東（巽・風門）",
            fortune: "吉",
            fortuneClass: "good",
            desc: "【風門】良き風が幸運を運ぶ方位。特に対人関係、商談、縁談、旅立ちにおいて大吉。遠き地からの良い知らせや、豊かな人間関係を育む好方位。"
        },
        {
            name: "南（午・離宮）",
            fortune: "平",
            fortuneClass: "normal",
            desc: "知性と美的感性を司る華やかな方位。己の才能を世に示すには最適。ただし、火の気が強いため感情が激しやすくなる傾向あり。冷静沈着を心がければ吉を招く。"
        },
        {
            name: "南西（坤・裏鬼門）",
            fortune: "大凶（裏鬼門）",
            fortuneClass: "bad",
            desc: "【裏鬼門】鬼門と対峙する不浄を嫌う方位。家庭内や足元のトラブルが生じやすい。地道な整理整頓や、焦らず足場を固めることが必要。お祓いを行い、守護の気を高めよ。"
        },
        {
            name: "西（酉・兌宮）",
            fortune: "吉",
            fortuneClass: "good",
            desc: "実りと社交, 金運を司る豊かな方位。会食や娯楽、金銭の融通に大吉。ただし、浪費や言葉の乱れが災いを引き寄せる恐れあり。感謝とともに楽しむべし。"
        },
        {
            name: "北西（乾・人門）",
            fortune: "吉",
            fortuneClass: "good",
            desc: "【人門】天の加護と高貴なる支援を司る方位。目上の引き立てや出世運、仕事での大勝負に吉。責任ある行動と礼節を重んじることで、さらなる天運が開ける。"
        }
    ];

    function getDirectionIndex(deg) {
        const normalized = (deg + 22.5) % 360;
        return Math.floor(normalized / 45);
    }

    // 羅盤の表示と警告表示の更新
    function updateCompassDisplay(deg) {
        heading = deg;
        angleValue.innerText = Math.round(deg);
        compassDisk.style.transform = `rotate(${-deg}deg)`;

        const dirIdx = getDirectionIndex(deg);
        const data = directionData[dirIdx];

        if (activeBarrier && (dirIdx === 1 || dirIdx === 5)) {
            directionFortune.innerText = "結界守護";
            directionFortune.className = "fortune-badge good";
            
            compassWrapper.classList.remove('warn');
            bgGlow.classList.remove('glow-warn');
            infoPanel.classList.remove('warn');
            
            infoTitle.innerText = data.name + " [結界呪符印]";
            infoDesc.innerText = "お祓いによって急急如律令の結界が張られておる。邪気は防がれ、当方位は一時的に大いなる守護の気に包まれておる。心安らかに過ごされよ。";
            return;
        }

        directionName.innerText = getDirectionKanji(dirIdx);
        directionFortune.innerText = data.fortune;
        directionFortune.className = `fortune-badge ${data.fortuneClass}`;

        infoTitle.innerText = data.name;
        infoDesc.innerText = data.desc;

        if (data.fortuneClass === 'bad') {
            compassWrapper.classList.add('warn');
            bgGlow.classList.add('glow-warn');
            infoPanel.classList.add('warn');
            if (navigator.vibrate && Math.random() < 0.1) {
                navigator.vibrate(40);
            }
        } else {
            compassWrapper.classList.remove('warn');
            bgGlow.classList.remove('glow-warn');
            infoPanel.classList.remove('warn');
        }
    }

    function getDirectionKanji(idx) {
        const kanji = ["北 (子)", "北東 (艮)", "東 (卯)", "南東 (巽)", "南 (午)", "南西 (坤)", "西 (酉)", "北西 (乾)"];
        return kanji[idx];
    }

    // 手動スライダーイベント
    manualSlider.addEventListener('input', (e) => {
        if (!isSensorActive) {
            updateCompassDisplay(parseInt(e.target.value));
        }
    });

    // センサー接続
    function handleOrientation(event) {
        let headingVal = null;
        if (event.webkitCompassHeading !== undefined) {
            headingVal = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            headingVal = 360 - event.alpha;
        }

        if (headingVal !== null) {
            manualSlider.value = Math.round(headingVal);
            updateCompassDisplay(headingVal);
        }
    }

    btnSyncCompass.addEventListener('click', async () => {
        initAudio();
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            sensorStatus.innerText = "センサーのアクセス権を要求中...";
            try {
                const permissionState = await DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    sensorPermissionGranted = true;
                    startSensor();
                } else {
                    sensorStatus.innerText = "センサーの使用が拒否されました（手動モード継続）";
                }
            } catch (error) {
                console.error(error);
                sensorStatus.innerText = "エラーが発生しました（手動モード継続）";
            }
        } else {
            sensorPermissionGranted = true;
            startSensor();
        }
    });

    function startSensor() {
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
            isSensorActive = true;
            sensorSuccess();
        } else if ('ondeviceorientation' in window) {
            window.addEventListener('deviceorientation', handleOrientation, true);
            isSensorActive = true;
            sensorSuccess();
        } else {
            sensorStatus.innerText = "当端末は方位センサーに非対応です（手動モード継続）";
        }
    }

    function sensorSuccess() {
        sensorStatus.innerText = "羅盤同期中：端末の向きを反映しております";
        sensorStatus.style.color = "#4ade80";
        document.getElementById('manual-adjust-area').style.display = 'none';
        playKaguraBell();
    }

    // === 宿命五行と日暦属性の相性占い ロジック ===
    let isTalismanFlipped = false;

    function seedRandom(seedStr) {
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) {
            hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        return function() {
            const x = Math.sin(hash++) * 10000;
            return x - Math.floor(x);
        };
    }

    // 相性の計算
    // relationIndexの判定: 0=比和, 1=相生(生じる), 2=相克(克される), 3=相克(克す), 4=相生(生じる)
    // 五行相生: 木(0)->火(1)->土(2)->金(3)->水(4)->木(0)
    // 五行相克: 木(0)->土(2)->水(4)->火(1)->金(3)->木(0)
    function checkGogyoRelation(userG, todayG) {
        if (userG === todayG) {
            return {
                type: '比和',
                desc: '本日は比和（ひわ）の関係。同種の気が重なり、貴殿の五行エネルギーが倍増する吉日。調子に乗りすぎなければ、極めて強い推進力を得られます。',
                modifier: 'hiwa'
            };
        }

        // 相生判定
        // 他が自分を生み出してくれる（受生）: 水(4)->木(0), 木(0)->火(1), 火(1)->土(2), 土(2)->金(3), 金(3)->水(4)
        if ((todayG + 1) % 5 === userG) {
            return {
                type: '相生（受生）',
                desc: `本日は相生（受生）の関係。今日の${elements[todayG].name}が貴殿の${elements[userG].name}を育む好日。何もしなくても運気が後押ししてくれる、最も幸福な相性です。`,
                modifier: 'sho-ju'
            };
        }
        // 自分が他を生み出す（生出）: 木(0)->火(1), 火(1)->土(2), 土(2)->金(3), 金(3)->水(4), 水(4)->木(0)
        if ((userG + 1) % 5 === todayG) {
            return {
                type: '相生（生出）',
                desc: `本日は相生（生出）の関係。貴殿の${elements[userG].name}が今日の${elements[todayG].name}を生み活性化させる日。自らのエネルギーを他者へ還元したり、自己表現するのに最適な吉日です。`,
                modifier: 'sho-shutsu'
            };
        }

        // 相克判定
        // 他が自分を克す（被克）: 金(3)->木(0), 木(0)->土(2), 土(2)->水(4), 水(4)->火(1), 火(1)->金(3)
        // 判定式: (today - user + 5) % 5 の関係
        // 木(0)は金(3)から克される: (3-0)=3. 火(1)は水(4)から: (4-1)=3. 土(2)は木(0): (0-2+5)=3. 金(3)は火(1): 2. 水(4)は土(2): 2.
        // 正確な被克(相手から自分がやられる):
        // 木(0) <- 金(3), 火(1) <- 水(4), 土(2) <- 木(0), 金(3) <- 火(1), 水(4) <- 土(2)
        if (
            (todayG === 3 && userG === 0) || 
            (todayG === 4 && userG === 1) || 
            (todayG === 0 && userG === 2) || 
            (todayG === 1 && userG === 3) || 
            (todayG === 2 && userG === 4)
        ) {
            return {
                type: '相克（被克）',
                desc: `本日は相克（被克）の関係。今日の${elements[todayG].name}が貴殿の${elements[userG].name}を圧迫する警戒日。無理に抗わず、慎重に身を守るべし。お祓いを施し災いを防ぎましょう。`,
                modifier: 'koku-hi'
            };
        }

        // 自分が他を克す（我克）:
        // 木(0) -> 土(2), 火(1) -> 金(3), 土(2) -> 水(4), 金(3) -> 木(0), 水(4) -> 火(1)
        return {
            type: '相克（我克）',
            desc: `本日は相克（我克）の関係。貴殿の${elements[userG].name}が今日の${elements[todayG].name}を制する日。自分の意志を通しやすいですが、エネルギーの消耗が激しくなりがち。謙虚さが吉を呼びます。`,
            modifier: 'koku-ga'
        };
    }

    // 今日の運勢を生成
    function generateDailyFortune() {
        const dateInfo = updateDateAndElement();
        
        // 生年月日が未設定の場合の代替処理 (基本機能は動くようにする)
        if (userGogyoIdx === null) {
            generateDefaultFortune(dateInfo);
            return;
        }

        const rand = seedRandom(dateInfo.dateString + "onmyoji_" + localStorage.getItem('onmyoji_birthdate'));
        const relation = checkGogyoRelation(userGogyoIdx, dateInfo.gogyoIdx);
        
        // 相性によって運勢確率を傾斜させる
        // 比和・相生(受生) -> 大吉・中吉・吉が出やすい
        // 被克 -> 凶・大凶が出やすい
        let fortunes = [];
        
        if (relation.modifier === 'sho-ju') { // 最高の相性
            fortunes = [
                { title: "大吉", rate: 0.40, text: `${relation.desc} 天の恵みと今日の${elements[dateInfo.gogyoIdx].name}が貴殿を全面的に肯定し、運気は絶頂に達しております。万事思い通りに進むので、躊躇せず大志を抱いて前進しなされ。` },
                { title: "中吉", rate: 0.35, text: `${relation.desc} 素晴らしい守護の気あり。貴殿の持つポテンシャルが自然と発揮されます。交渉事や買い出し、周囲の相談に乗ると感謝の連鎖が始まります。` },
                { title: "吉", rate: 0.20, text: `${relation.desc} 穏やかで豊かな追い風を感じる日。特に鬼門以外の方向、東や南東へのお出かけは好運をもたらします。謙虚に過ごせばさらに安泰。` },
                { title: "末吉", rate: 0.05, text: `${relation.desc} 恵みの気があるものの、自身の油断から小さなミスを犯しやすい相。感謝を忘れず、周囲と協調すれば大過ありません。` }
            ];
        } else if (relation.modifier === 'hiwa' || relation.modifier === 'sho-shutsu') { // 良好な相性
            fortunes = [
                { title: "大吉", rate: 0.25, text: `${relation.desc} 気がみなぎり、自己の可能性が大きく広がります。特にクリエイティブな活動や自己主張は大吉。鬼門にさえ入らなければ大いに飛躍できます。` },
                { title: "中吉", rate: 0.35, text: `${relation.desc} エネルギーが充実した一日。多少の障壁も、貴殿の本来の力でたやすく突破できるでしょう。南への移動が良き運気を高めます。` },
                { title: "吉", rate: 0.30, text: `${relation.desc} 周囲との調和が取れた好調な日。相手を生かす心がけが、結果として自分に何倍もの福となって戻ってきます。` },
                { title: "末吉", rate: 0.10, text: `${relation.desc} 意欲はあるものの、一歩踏み出すには材料不足。今日は焦らず準備に徹し、お祓いを施して明日に備えるが吉。` }
            ];
        } else if (relation.modifier === 'koku-hi') { // 警戒すべき相性 (被克)
            fortunes = [
                { title: "末吉", rate: 0.30, text: `${relation.desc} 今日の運気が貴殿にプレッシャーをかけております。無理な戦いは避け、城を守るが如く現状維持を。西の方向に向かうと少し気が和らぎます。` },
                { title: "凶", rate: 0.50, text: `${relation.desc} 相性が悪く、何事も裏目に出やすい傾向あり。心身ともに疲弊しやすいので、無理な予定はキャンセルし、早めに身を清めてゆっくり休まれることを強くお勧めいたします。` },
                { title: "大凶", rate: 0.20, text: `${relation.desc} 邪気からの圧力が最大となる最悪の相関。本日は絶対に大勝負を避け、大人しく過ごさねばなりません。即座にお祓い（急急如律令）を施し、結界の加護を受けられよ。` }
            ];
        } else { // 我克（今日を制するが消耗する）
            fortunes = [
                { title: "中吉", rate: 0.15, text: `${relation.desc} 自分のペースで物事を進められますが、多少の抵抗に遭う暗示。強引になりすぎず、相手の言い分にも耳を傾ければ吉を維持できます。` },
                { title: "吉", rate: 0.40, text: `${relation.desc} 主導権は貴殿にありますが、エネルギーの消費が早い日。こまめな急速と、心のお祓いをして調律を保つことで好結果を得られます。` },
                { title: "末吉", rate: 0.35, text: `${relation.desc} 相手や現状を克服するのに力みすぎて空回りする相。肩の力を抜き、北西の方位の気がもたらす落ち着きを取り入れてみてください。` },
                { title: "凶", rate: 0.10, text: `${relation.desc} 制御しようとした物事から反撃を受ける相。余計な手出しは災いのもと。今日はただ嵐が過ぎるのを待つがごとく静観せよ。` }
            ];
        }

        const r = rand();
        let cumulative = 0;
        let selectedFortune = fortunes[fortunes.length - 1];

        for (let f of fortunes) {
            cumulative += f.rate;
            if (r <= cumulative) {
                selectedFortune = f;
                break;
            }
        }

        fortuneResult.innerText = selectedFortune.title;
        fortuneElement.innerText = `相性判定：${relation.type}`;
        fortuneText.innerText = selectedFortune.text;

        if (selectedFortune.title.includes("凶")) {
            fortuneResult.style.color = "#c92a2a";
        } else {
            fortuneResult.style.color = "#d4af37";
        }
    }

    // 生年月日未登録時のデフォルト占い
    function generateDefaultFortune(dateInfo) {
        const rand = seedRandom(dateInfo.dateString + "onmyoji_default");
        const fortunes = [
            { title: "大吉", rate: 0.15, text: "天晴れ極まり、天地の気が貴人を護持す。諸事万端進んで吉。右上の「運命調律」より生年月日をご登録いただければ、より精緻な五行相性占いが開示されまする。" },
            { title: "吉", rate: 0.50, text: "穏やかなる風が良き便りを運ぶ一日。日頃の善行が実を結びます。右上の「運命調律」より生年月日をご登録くだされば、主様の宿命に紐づいた宣託を生成いたします。" },
            { title: "凶", rate: 0.35, text: "少し気が乱れやすい相。大事な決断は慎重に行うが賢明なり。生年月日をご登録いただくことで、本日の五行属性との詳細な相性診断とパーソナライズ対策を占えます。" }
        ];

        const r = rand();
        let cumulative = 0;
        let selectedFortune = fortunes[fortunes.length - 1];

        for (let f of fortunes) {
            cumulative += f.rate;
            if (r <= cumulative) {
                selectedFortune = f;
                break;
            }
        }

        fortuneResult.innerText = selectedFortune.title;
        fortuneElement.innerText = `相性判定：未調律`;
        fortuneText.innerText = selectedFortune.text;
        fortuneResult.style.color = selectedFortune.title.includes("凶") ? "#c92a2a" : "#d4af37";
    }

    talisman.addEventListener('click', () => {
        if (!isTalismanFlipped) {
            playPaperSound();
            generateDailyFortune();
            talisman.classList.add('flipped');
            isTalismanFlipped = true;
        }
    });

    // === 急急如律令（お祓い）アクション ===
    btnPurify.addEventListener('click', () => {
        initAudio();
        
        purifyOverlay.classList.add('active');
        playKaguraBell();

        if (navigator.vibrate) {
            navigator.vibrate([100, 80, 100, 80, 200]);
        }

        const currentDirIdx = getDirectionIndex(heading);
        if (currentDirIdx === 1 || currentDirIdx === 5) {
            activeBarrier = true;
            if (barrierTimer) clearTimeout(barrierTimer);
            
            // 30秒間結界を張る（一時的な鬼門封じ）
            barrierTimer = setTimeout(() => {
                activeBarrier = false;
                updateCompassDisplay(heading);
            }, 30000);
        }

        setTimeout(() => {
            purifyOverlay.classList.remove('active');
            updateCompassDisplay(heading);
        }, 2200);
    });

    // === 初期化実行 ===
    updateDateAndElement();
    updateCompassDisplay(0);
    initSettingsModal();
});
