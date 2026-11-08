// Küçük kardeş ölçümü (08.11.2026, Özet §58 — Ercan: "Küçük 2GB çalışan Kardeş").
// Modeli Heybe'nin ayarıyla açar (-c 8192, -np 1), Heybe'nin gerçek bir isteğini (kayıtlı bir sınav sorusu + onun
// kaynak paragrafları) sorar; açılış süresini, en yüksek yerleşik belleği (RSS) ve hızı yazar.
// Kullanım: node olcum/kardes/bellek_olc.cjs <model.gguf> [kapı=18090] [soru kimliği=W01]   (CPU=1: ekran kartı kapalı,
//   zayıf bilgisayar gibi; bellek ölçüsü o zaman bütün yükü gösterir)
// Not: RSS, belleğe gerçekten yüklenmiş sayfalardır; modelin kullanılmayan parçaları diskte kalabilir (mmap).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const H = path.join(__dirname, '..', '..');
const LLAMA = path.join(H, 'tasinabilir', 'indirilen', 'llamafile-0.10.6');
const [model, kapi = '18090', kimlik = 'W01'] = process.argv.slice(2);
if (!model || !fs.existsSync(model)) { console.error('model dosyası yok'); process.exit(2); }
const ADRES = `http://127.0.0.1:${kapi}`;

// soru ve kaynakları: 0.12.0 W ölçümünün kaydından (aynı soru, aynı paragraflar)
const kayitlar = fs.readFileSync(path.join(H, 'olcum', 'sonuc', 'banka_0.12.0_W.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const k = kayitlar.find((r) => r.kimlik === kimlik && r.parcalar.length) || kayitlar.find((r) => r.parcalar.length);
const SISTEM = `Sen çevrim dışı çalışan bir yardımcı arkadaşsın. İnternet yok. Sana KAYNAKLAR verilecek.
Kurallar:
1. Yalnızca KAYNAKLAR'da yazanı kullan. Kendi bilgini ekleme.
2. Her bilginin sonuna kaynağın numarasını [1] gibi yaz.
3. Kaynaklarda sorunun cevabı yoksa yalnızca şunu yaz: "Kaynaklarımda bu bilgi yok." Tahmin etme.
4. İlaç dozu kaynakta açıkça yazmıyorsa asla doz söyleme.
5. Kısa, sakin, maddeler halinde, Türkçe yaz.`;
const kaynak = k.parcalar.map((p, i) => `[${i + 1}] ${p.makale}${p.bolum ? ' — ' + p.bolum : ''}\n${p.metin}`).join('\n\n');

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
// llamafile bir APE: /bin/sh ile açılır; süreç ve bütün çocukları toplanır
const rssMB = (pid) => {
  try {
    const satir = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=']).toString().trim().split('\n').map((x) => x.trim().split(/\s+/).map(Number));
    const kume = new Set([pid]);
    for (let d = 0; d < 4; d++) for (const [p, pp] of satir) if (kume.has(pp)) kume.add(p);
    return Math.round(satir.filter(([p]) => kume.has(p)).reduce((a, [, , r]) => a + r, 0) / 1024);
  } catch (e) { return 0; }
};

(async () => {
  const t0 = Date.now();
  const s = spawn('/bin/sh', [LLAMA, '--server', '--host', '127.0.0.1', '--port', kapi, '--no-webui', '-np', '1', '-m', model, '-c', '8192', ...(process.env.CPU === '1' ? ['-ngl', '0'] : [])],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let gunluk = '';
  s.stderr.on('data', (d) => { gunluk += d; });
  let enCok = 0;
  const ornek = setInterval(() => { enCok = Math.max(enCok, rssMB(s.pid)); }, 300);
  let acildi = false;
  for (let i = 0; i < 600 && !acildi; i++) {
    await bekle(500);
    if (s.exitCode !== null) break;
    try { acildi = (await (await fetch(`${ADRES}/health`)).text()).includes('ok'); } catch (e) { /* daha açılmadı */ }
  }
  const acilis = Math.round((Date.now() - t0) / 100) / 10;
  if (!acildi) {
    clearInterval(ornek); s.kill();
    console.log(JSON.stringify({ model: path.basename(model), acildi: false, gunluk: gunluk.slice(-1500) }, null, 1));
    return;
  }
  const bosta = rssMB(s.pid);
  let sablon = '';
  try { sablon = String((await (await fetch(`${ADRES}/props`)).json()).chat_template || ''); } catch (e) { /* yok */ }
  const t1 = Date.now();
  const y = await (await fetch(`${ADRES}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'system', content: SISTEM }, { role: 'user', content: `KAYNAKLAR:\n${kaynak}\n\nSORU: ${k.soru}` }],
      max_tokens: 350, temperature: 0, seed: 1, chat_template_kwargs: { enable_thinking: false } }),
  })).json();
  const cevapSn = Math.round((Date.now() - t1) / 100) / 10;
  await bekle(400);
  clearInterval(ornek);
  enCok = Math.max(enCok, rssMB(s.pid));
  s.kill();
  const z = y.timings || {};
  console.log(JSON.stringify({
    model: path.basename(model), islemci: process.env.CPU === '1' ? 'yalnız CPU' : 'varsayılan', dosyaMB: Math.round(fs.statSync(model).size / 1048576), acilis_sn: acilis,
    bellek_bosta_MB: bosta, bellek_enCok_MB: enCok, cevap_sn: cevapSn,
    istem_jeton: z.prompt_n, istem_hiz: z.prompt_per_second && Math.round(z.prompt_per_second),
    uretim_jeton: z.predicted_n, uretim_hiz: z.predicted_per_second && Math.round(z.predicted_per_second * 10) / 10,
    soru: `${k.kimlik}: ${k.soru}`, cevap: ((y.choices || [])[0] || {}).message?.content?.slice(0, 600) || y,
    sablon_bas: sablon.slice(0, 240),
  }, null, 1));
})();
