/**
 * ☯ 陰陽鬼門羅盤・日暦占術 (script.js)
 * 陰陽道の真理、羅盤とコンパスの同期、Web Audioによるお清めの音階、日ごとの運勢占いを司る。
 */

document.addEventListener('DOMContentLoaded', () => {
    // === 状態管理変数 ===
    let heading = 0; // 現在の方位角 (0-359度)
    let isSensorActive = false; // デバイスセンサーが動作中か
    let sensorPermissionGranted = false; // センサー許可状態
    let activeBarrier = false; // 結界（一時的鬼門封じ）発動フラグ
    let barrierTimer = null;
    let audioCtx = null; // Web Audio API コンテキスト

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
        // 高周波の金属音のシミュレーション（複数の金属的倍音）
        const frequencies = [2048, 2560, 3072, 3584, 4096, 5120];
        
        frequencies.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            
            // 鈴の揺らぎ（ビブラート・LFO）
            const lfo = audioCtx.createOscillator();
            const lfoGain = audioCtx.createGain();
            lfo.frequency.setValueAtTime(30, startTime); // 高速な揺らし
            lfoGain.gain.setValueAtTime(50, startTime);
            
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            
            // 音量減衰のエンベロープ
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
        const bufferSize = audioCtx.sampleRate * 0.15; // 0.15秒
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // ホワイトノイズの生成
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        
        // フィルターで紙の擦れに近い帯域に
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 0.5;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noise.start(now);
        noise.stop(now + 0.15);
    }

    // === 日付・十干十二支・五行の算出 ===
    const elements = [
        { name: '木気', colorClass: 'badge-wood', element: 'wood' }, // 甲・乙
        { name: '火気', colorClass: 'badge-fire', element: 'fire' }, // 丙・丁
        { name: '土気', colorClass: 'badge-earth', element: 'earth' }, // 戊・己
        { name: '金気', colorClass: 'badge-metal', element: 'metal' }, // 庚・辛
        { name: '水気', colorClass: 'badge-water', element: 'water' }  // 壬・癸
    ];

    const jukkan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const junishi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const rokuyou = ['大安', '赤口', '先勝', '友引', '先負', '仏滅'];

    function updateDateAndElement() {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const date = today.getDate();
        
        // 令和換算 (2019年が令和元年)
        const reiwaYear = year - 2018;
        const reiwaText = reiwaYear > 0 ? `令和${reiwaYear}年` : `西暦${year}年`;
        
        // 日本語の日付表記
        currentDateEl.innerText = `${reiwaText} ${month}月${date}日`;

        // 基準日 2026-01-01 (日干支は「丙寅」: 十干丙=2, 十二支寅=2)
        const baseDate = new Date('2026-01-01');
        const diffTime = today - baseDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        // 日干支インデックス
        const kanIdx = ((2 + diffDays) % 10 + 10) % 10;
        const shiIdx = ((2 + diffDays) % 12 + 12) % 12;

        // 五行の決定 (十干の2つずつが対応：木、火、土、金、水)
        const elemIdx = Math.floor(kanIdx / 2);
        const currentElement = elements[elemIdx];

        // 六曜の簡易シミュレーション (旧暦換算の代わりに経過日数からマッピング)
        const rokuyouIdx = ((month + date) % 6);
        const currentRokuyou = rokuyou[rokuyouIdx];

        currentElementEl.innerText = `${jukkan[kanIdx]}${junishi[shiIdx]}日 (${currentRokuyou}) / ${currentElement.name}`;
        
        // クラスの付け替え
        currentElementEl.className = 'element-badge';
        currentElementEl.classList.add(currentElement.colorClass);

        return { element: currentElement, dateString: `${month}月${date}日` };
    }

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
            desc: "実りと社交、金運を司る豊かな方位。会食や娯楽、金銭の融通に大吉。ただし、浪費や言葉の乱れが災いを引き寄せる恐れあり。感謝とともに楽しむべし。"
        },
        {
            name: "北西（乾・人門）",
            fortune: "吉",
            fortuneClass: "good",
            desc: "【人門】天の加護と高貴なる支援を司る方位。目上の引き立てや出世運、仕事での大勝負に吉。責任ある行動と礼節を重んじることで、さらなる天運が開ける。"
        }
    ];

    // 方位角(0〜359)からインデックス（0〜7）を割り出す
    function getDirectionIndex(deg) {
        // 北が0度で、45度刻み。各境界は中間に位置する
        // 例: 北（337.5〜22.5）、北東（22.5〜67.5）
        const normalized = (deg + 22.5) % 360;
        return Math.floor(normalized / 45);
    }

    // 羅盤の表示と警告表示の更新
    function updateCompassDisplay(deg) {
        heading = deg;
        angleValue.innerText = Math.round(deg);
        
        // 羅盤SVGを逆回転させて、天針が正しい方角を指すようにする
        compassDisk.style.transform = `rotate(${-deg}deg)`;

        const dirIdx = getDirectionIndex(deg);
        const data = directionData[dirIdx];

        // 結界発動中は鬼門・裏鬼門でも吉に変化するイースターエッグ
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

        // 通常の吉凶反映
        directionName.innerText = getDirectionKanji(dirIdx);
        directionFortune.innerText = data.fortune;
        directionFortune.className = `fortune-badge ${data.fortuneClass}`;

        infoTitle.innerText = data.name;
        infoDesc.innerText = data.desc;

        if (data.fortuneClass === 'bad') {
            compassWrapper.classList.add('warn');
            bgGlow.classList.add('glow-warn');
            infoPanel.classList.add('warn');
            // スマホ微振動 (鬼門に入った瞬間に短い振動)
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

    // === 手動スライダーイベント ===
    manualSlider.addEventListener('input', (e) => {
        if (!isSensorActive) {
            updateCompassDisplay(parseInt(e.target.value));
        }
    });

    // === センサー制御（デバイスコンパス同期） ===
    function handleOrientation(event) {
        let headingVal = null;

        // iOS特有のプロパティ
        if (event.webkitCompassHeading !== undefined) {
            headingVal = event.webkitCompassHeading;
        } 
        // 標準仕様（デバイスのアルファ値）
        else if (event.alpha !== null) {
            // deviceorientationabsolute で無い場合、北の基準が異なることがあるため、
            // event.absoluteがあるか、あるいは通常のalpha方位を調整する
            headingVal = 360 - event.alpha; // 多くのAndroid・標準ブラウザで時計回りの角度を得るための反転
        }

        if (headingVal !== null) {
            // スライダーの値も同期させる
            manualSlider.value = Math.round(headingVal);
            updateCompassDisplay(headingVal);
        }
    }

    btnSyncCompass.addEventListener('click', async () => {
        initAudio();
        
        // iOS 13+ センサー許可要求への対応
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
            // iOS 13+ 以外のデバイス (Android / PCなど)
            sensorPermissionGranted = true;
            startSensor();
        }
    });

    function startSensor() {
        // absoluteイベントを優先
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
        document.getElementById('manual-adjust-area').style.display = 'none'; // 手動スライダーを隠す
        playKaguraBell();
    }

    // === 日ごとの運勢占い ロジック ===
    let isTalismanFlipped = false;

    // 日付と数値をシード値にする簡易シーム乱数
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

    // 今日の運勢を生成
    function generateDailyFortune() {
        const dateInfo = updateDateAndElement();
        const rand = seedRandom(dateInfo.dateString + "onmyoji");
        
        const fortunes = [
            { title: "大吉", rate: 0.15, elementMatch: "木・水気の運気と調和", text: "天晴れ極まり、天地の気が貴人を護持す。諸事万端進んで吉。新しい門出や決断はこの日に行うが良し。お祓いにてさらに運気向上せん。" },
            { title: "中吉", rate: 0.25, elementMatch: "火・土気の運気と調和", text: "日輪の照らす如き穏やかなる発展の兆しあり。焦らず歩みを進めれば望みは達せられる。東（卯方位）に吉縁あり。" },
            { title: "吉", rate: 0.25, elementMatch: "金・水気の運気と調和", text: "穏やかなる風が良き便りを運ぶ一日。日頃の善行が実を結ぶ。感謝の念を言葉にして周囲に伝えよ。南東が吉方位。" },
            { title: "末吉", rate: 0.20, elementMatch: "土・金気の運気と調和", text: "吉凶半々、堅実に守るべき日なり。冒険を避けて身近な人の和を重んじよ。北西に向かうと心穏やかになり開運。" },
            { title: "凶", rate: 0.12, elementMatch: "木・金気の乱れあり", text: "雲行き怪しき相。些細な言動から誤解が生じやすい。鬼門および裏鬼門の方角を避けて行動せよ。急急如律令にて身を清めよ。" },
            { title: "大凶", rate: 0.03, elementMatch: "全属性の不調和", text: "百鬼夜行の如き難局の兆し。大事な決断は明日以降に延ばすが賢明なり。お祓い（急急如律令）を施し、結界を張りて身を慎め。" }
        ];

        // 乱数をもとに確率分布に従っておみくじを選択
        const r = rand();
        let cumulative = 0;
        let selectedFortune = fortunes[fortunes.length - 1]; // フォールバックは最後の大凶

        for (let f of fortunes) {
            cumulative += f.rate;
            if (r <= cumulative) {
                selectedFortune = f;
                break;
            }
        }

        // 表示の更新
        fortuneResult.innerText = selectedFortune.title;
        fortuneElement.innerText = `相性：${selectedFortune.elementMatch}`;
        fortuneText.innerText = selectedFortune.text;

        // 大凶や凶のときは赤い文字にするなどのデザイン切り替え
        if (selectedFortune.title.includes("凶")) {
            fortuneResult.style.color = "#c92a2a";
        } else {
            fortuneResult.style.color = "#d4af37";
        }
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
        
        // お祓いアニメーション発動
        purifyOverlay.classList.add('active');

        // 音響：神楽鈴の音
        playKaguraBell();

        // 端末バイブレーション（お清めの脈動）
        if (navigator.vibrate) {
            navigator.vibrate([100, 80, 100, 80, 200]);
        }

        // 鬼門・裏鬼門結界発動
        const currentDirIdx = getDirectionIndex(heading);
        if (currentDirIdx === 1 || currentDirIdx === 5) {
            activeBarrier = true;
            // 前のタイマーがあればクリア
            if (barrierTimer) clearTimeout(barrierTimer);
            
            // 30秒間結界を張る（一時的な鬼門封じ）
            barrierTimer = setTimeout(() => {
                activeBarrier = false;
                updateCompassDisplay(heading); // 再更新して元の凶に戻す
            }, 30000);
        }

        // 2秒後にお祓い画面をフェードアウト
        setTimeout(() => {
            purifyOverlay.classList.remove('active');
            updateCompassDisplay(heading); // 状態再描画（結界が反映されるように）
        }, 22000 / 10); // 2.2秒
    });

    // === 初期実行 ===
    updateDateAndElement();
    updateCompassDisplay(0); // 初期は北向き（0度）
});
