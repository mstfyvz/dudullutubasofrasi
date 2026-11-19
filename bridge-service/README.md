# Tuba Sofrası - Bridge Service

Mutfak yazıcılarına otomatik sipariş yazdırma servisi.

## 🎯 Amaç

Bu servis, Firestore'daki yeni siparişleri dinler ve ürünleri **mutfak istasyonlarına** göre gruplandırarak tanımlı yazıcılara otomatik gönderir.

## 📋 Gereksinimler

- **Node.js 18+** (LTS önerilir)
- **macOS** (CUPS yazdırma sistemi etkin olmalı) veya **Windows 10/11**
- **Yazıcılar** işletim sistemine eklenmiş olmalı; macOS'ta `lpstat -p` ile görünür olmalı
- **Firebase Service Account Key** (JSON dosyası)

## 🚀 Kurulum

### 1. Node.js Kurulumu

[nodejs.org](https://nodejs.org) adresinden LTS sürümünü indirin ve kurun.

### 2. Bağımlılıkları Yükle

```bash
cd bridge-service
npm install
```

### 3. Firebase Service Account Key

1. [Firebase Console](https://console.firebase.google.com) → Projeniz → **Project Settings** → **Service Accounts**
2. **Generate New Private Key** butonuna tıklayın
3. İndirilen JSON dosyasını `bridge-service/serviceAccountKey.json` olarak kaydedin

**⚠️ ÖNEMLİ:** Bu dosyayı asla paylaşmayın veya git'e eklemeyin!

### 4. Çevre Değişkenleri

```bash
cp .env.example .env
```

Varsayılan port 3001. Değiştirmek isterseniz `.env` dosyasını düzenleyin.

## ▶️ Çalıştırma

### Manuel Başlatma

```bash
npm start
```

Konsol çıktısı:

```
✓ Bridge service başlatıldı: http://localhost:3001
✓ Firestore dinleniyor...
✓ Yazıcı ayarları güncellendi: { enabled: true, ... }
✓ 15 kategori yüklendi
```

### Geliştirme Modu (Auto-Reload)

```bash
npm run dev
```

## 🖨️ Windows: Tek Bilgisayardan Ağ Yazıcıları

Bu kurulumda tek Bridge bilgisayarı Firestore'u dinler ve sipariş fişlerini Windows yazıcı kuyrukları üzerinden ağ yazıcılarına yollar. Garson telefonlarının yazıcılara veya Bridge bilgisayarına doğrudan bağlanması gerekmez; telefonlar siparişi Firebase'e kaydeder.

### 1. IP Adreslerini Sabitleyin

Router'da DHCP rezervasyonu kullanarak adresleri sabitleyin. Bu kurulum için:

- Bridge Windows PC: `192.168.1.160`
- Kasa: `192.168.1.150`
- Izgara: `192.168.1.151`
- Fırın: `192.168.1.152`
- Burger: `192.168.1.153`
- Tatlı: `192.168.1.154`
- Henüz kullanılmayan yazıcı: `192.168.1.155`

IP'lerin router'ın DHCP havuzuyla çakışmadığını ve cihazların aynı LAN/VLAN'da olduğunu doğrulayın.

### 2. Yazıcıları Windows'a Ekleyin

Windows **Settings → Bluetooth & devices → Printers & scanners → Add device** bölümünden her yazıcıyı TCP/IP adresiyle ekleyin. Her cihaz için üretici/modelin desteklediği sürücüyü seçin ve Windows'ta ayırt edilebilir bir kuyruk adı verin (ör. `Kasa_150`, `Izgara_151`). Bridge IP'yi değil, Windows'ta kurulu kuyruk adını kullanır.

`bridge-service/.env` dosyasında `BRIDGE_STATION` ve `PRINTER_NAME` boş bırakılmalıdır. Node.js 18+ ile bridge'i Windows PC'de başlatın:

```powershell
cd bridge-service
npm install
npm start
```

Windows Defender Firewall'da yerel ağdan TCP `3001` gelen bağlantısına izin verin.

### 3. Admin Ayarlarını Yapın

**Admin → Ayarlar → Yazıcı Ayarları** bölümünde beş istasyonun Bridge adresini `http://192.168.1.160:3001` yapın. Her satırdaki Test düğmesini kullanın; Windows kuyrukları göründükten sonra istasyon için ilgili kuyruğu seçin ve ayarları kaydedin. Eşleştirme `.150` Kasa, `.151` Izgara, `.152` Fırın, `.153` Burger ve `.154` Tatlı'dır. `.155` listelenir ama bir istasyona atanıncaya kadar sipariş almaz.

Ürün kategorilerini **Admin → Ürünler** bölümünde Fırın, Izgara, Burger veya Tatlı istasyonuna atayın. Kasa fişleri kasiyer ekranından Kasa istasyonuna gider.

### 4. Sipariş Akışı

Garson siparişi telefondan Firebase'e kaydeder. Bridge Windows PC'de Firestore'u dinler, ürün kategorisine göre yazıcı kuyruğunu seçer ve fişi Windows Print Spooler üzerinden ilgili IP yazıcısına yollar. Telefonların Bridge PC ile aynı Wi-Fi'da olması gerekmez; Firebase'e internet erişimleri yeterlidir.

## 🖨️ macOS Yazıcı Yapılandırması

### 1. Yazıcıları macOS'a Ekleyin

- **System Settings** → **Printers & Scanners** → **Add Printer**
- USB yazıcıları ekleyin ve üretici/model için uygun sürücüyü seçin.
- Terminal'de `lpstat -p` komutunu çalıştırarak kuyruk adlarını doğrulayın.
- Bridge çalışacak bilgisayardaki yerel kuyruk adını not edip `.env` dosyasındaki `PRINTER_NAME` alanına yazın.

### 2. Her Bilgisayarda Bir Bridge Çalıştırma

Her yazıcının bağlı olduğu bilgisayarda Bridge Service'i ayrı ayrı kurup çalıştırın. Her kurulum aynı Firebase projesindeki `serviceAccountKey.json` dosyasını kullanır. Bilgisayarlar aynı yerel ağa erişebilmelidir.

Her bilgisayardaki `bridge-service/.env` dosyasına **o bilgisayara ait tek istasyonu** ve o bilgisayardaki CUPS yazıcı kuyruğunu yazın:

```env
PORT=3001
BRIDGE_STATION=station1
PRINTER_NAME=Gainscha_GA_E200
```

`BRIDGE_STATION` değerleri: Fırın için `station1`, Izgara için `station2`, Kasa için `station3`, Burger için `station4`, Tatlı için `station5`. `PRINTER_NAME`, yalnızca o bilgisayarda `lpstat -p` ile görünen yerel kuyruk adıdır. Her bilgisayarda aynı port kullanılabilir.

Örnek olarak Fırın bilgisayarında `BRIDGE_STATION=station1`, Izgara bilgisayarında `BRIDGE_STATION=station2`, Kasa bilgisayarında `BRIDGE_STATION=station3`, Burger bilgisayarında `BRIDGE_STATION=station4` kullanılır. Her birine bağlı yazıcının yerel kuyruk adını ayrıca girin. İstasyon başına birden fazla yazıcı gerekiyorsa aynı istasyon değeriyle birden fazla cihaz yapılandırması ayrıca desteklenmiyor; bu kurulumda tek bilgisayar/bridge/yerel kuyruk istasyon başınadır.

### 3. Admin Panelden Bridge Adreslerini Girme

1. Her bilgisayarın yerel IP adresini bulun ve o bilgisayardaki bridge URL'sini belirleyin (ör. `http://192.168.1.50:3001`).
2. Web uygulamasında **Admin → Ayarlar** bölümünde Fırın, Izgara, Kasa ve Burger için ilgili bilgisayarın URL'sini girin.
3. Her URL'nin yanındaki **Test** düğmesini kullanın. Test, bridge'in doğru `BRIDGE_STATION` ile çalıştığını ve yerel yazıcı kuyruğunu görüp görmediğini doğrular.
4. **Otomatik Yazdırma**'yı açıp **Ayarları Kaydet**'e basın.
5. Ürün kategorilerini Ürünler sayfasında Fırın, Izgara veya Burger istasyonuna atayın.

Bridge bilgisayarlarında işletim sistemi güvenlik duvarı varsa uygulamanın TCP `3001` portuna yerel ağdan erişmesine izin verin. HTTPS üzerinden yayınlanan web uygulamalarında tarayıcı güvenlik kuralları HTTP bridge adreslerine erişimi engelleyebilir; bu durumda bridge için güvenli HTTPS erişimi veya uygulamayla uyumlu bir yerel ağ kurulumu gerekir.

### 4. Kategorilere İstasyon Ata

**Admin → Ürünler** sayfasında:

1. Kategori düzenle butonuna tıklayın
2. **Mutfak İstasyonu** dropdown'ından seçin
3. Kaydet

Örnek:
- Fırın ürünleri → Fırın
- Izgara ürünleri → Izgara
- Burger ürünleri → Burger
- Tatlı ürünleri → Tatlı
- Mutfak fişi gerektirmeyen ürünler (ör. içecekler) → Yok

Kasa fişi, ürün kategorisinden bağımsız olarak kasiyer ekranından manuel yazdırılır.

## 📄 Nasıl Çalışır?

1. **Garson** yeni sipariş girer → Firestore'a kaydedilir
2. Her Bridge yeni sipariş olayını alır
3. Ürünler kategorilerine göre Fırın/Izgara/Burger/Tatlı olarak gruplandırılır
4. `BRIDGE_STATION` ayarlıysa Bridge yalnızca o istasyonu işler; boşsa tüm istasyonlar için Firebase'deki kuyruk eşlemesini kullanır
5. Her ürün satırı için ayrı fiş oluşturup ilgili Windows yazıcı kuyruğuna gönderir

Birden fazla Bridge kullanılıyorsa her bilgisayarda farklı `BRIDGE_STATION` kullanın. Tek bilgisayarlı kurulumda bu değişkeni boş bırakın.

**Örnek Sipariş:**
```
Masa 5:
- 2x Döner (Izgara → Izgara yazıcısı)
- 1x Pide (Fırın → Fırın yazıcısı)
- 1x Tavuk Şiş (Izgara → Izgara yazıcısı)
- 1x Cheeseburger (Burger → Burger yazıcısı)
```

**Yazdırılan Fişler:**

**Fırın yazıcısı:**
```
TUBA SOFRASI
FİŞ NO: 00001
MASA 5
FIRIN
------------------------------------------
2x Pide
```

**Izgara yazıcısı:**
```
TUBA SOFRASI
FİŞ NO: 00002
MASA 5
IZGARA
------------------------------------------
2x Döner
```

Izgara yazıcısındaki diğer ürün de ayrı fiş alır:
```
FİŞ NO: 00003
MASA 5
IZGARA
------------------------------------------
1x Tavuk Şiş
```

## 🔧 Windows Servisi Olarak Kurulum (Opsiyonel)

Bilgisayar her açıldığında otomatik başlaması için:

### 1. NSSM (Non-Sucking Service Manager) Kur

[nssm.cc](https://nssm.cc/download) adresinden indirin.

### 2. Servisi Oluştur

```cmd
nssm install TubaSofrasiBridge
```

**GUI'de:**
- Path: `C:\Program Files\nodejs\node.exe`
- Startup directory: `C:\...\bridge-service`
- Arguments: `index.js`

**Service name:** TubaSofrasiBridge

### 3. Servisi Başlat

```cmd
nssm start TubaSofrasiBridge
```

### Servisi Durdur/Sil

```cmd
nssm stop TubaSofrasiBridge
nssm remove TubaSofrasiBridge confirm
```

## 🐛 Hata Giderme

### "Yazıcı listesi boş"

- macOS **Printers & Scanners** bölümünde yazıcıları kontrol edin
- `lpstat -p` çıktısında yazıcı kuyrukları görünüyor mu?
- Yazıcı sürücülerinin kurulu ve yazıcıların açık/bağlı olduğundan emin olun
- Bridge service yeniden başlatın

### "Bridge servise ulaşılamıyor"

- `http://localhost:3001` açıldığında `{"status":"Bridge service çalışıyor"}` görmeli
- Firewall/antivirus port 3001'i engelliyor olabilir
- `npm start` ile servisi çalıştırın

### "Firebase permission denied"

- `serviceAccountKey.json` dosyası doğru mu?
- Firestore rules admin yazabilir mi?
- Firebase project ID doğru mu?

### Fiş yazdırılmıyor

1. **Konsol log'larını kontrol edin:**
   - "Otomatik yazdırma kapalı" → Admin ayarlardan aktif edin
   - "İstasyon tanımlanmamış" → Kategorilere istasyon atayın
   - "Bu bridge istasyonunda yapılandırılmadığı için atlandı" → Beklenen station değeri diğer bilgisayardaki bridge tarafından işlenir
   - `PRINTER_NAME` → `.env` dosyasındaki yerel yazıcı kuyruğu adını `lpstat -p` ile doğrulayın

2. **Test yazdırma:**
   - İşletim sisteminden yazıcıya test sayfası bastırın
   - Yazıcı çevrimiçi ve kağıdı var mı?

## 📦 API Endpoints

### `GET /`
Health check; station-specific bridge için yapılandırılmış istasyonu da döndürür.

**Response:**
```json
{
  "status": "Bridge service çalışıyor",
  "version": "1.0.0",
  "station": "station1"
}
```

### `GET /printers`
İşletim sisteminde tanımlı yazıcı listesi (macOS'ta CUPS üzerinden).

**Response:**
```json
{
  "printers": [
    "EPSON TM-T88V",
    "Star TSP100",
    "Microsoft Print to PDF"
  ]
}
```

### Kasa fişi yazdırma
Kasa ekranındaki **Kasa Yazıcısında Yazdır** düğmesi, `cashierPrintRequests` koleksiyonuna yetkili kasiyer hesabıyla istek yazar ve sonucu Firestore'dan dinler. Bridge, station3'ü işleyen kuyruğa ESC/POS RAW fişi gönderir; merkezî kurulumda hedef `stationMapping.station3`, istasyona özel kurulumda `PRINTER_NAME` olur. Ürün başına modunda fiyat yazdırılmaz; sipariş bazlı modda tutarlar yazdırılır.

Yeni `pending` siparişlerde Fırın (`station1`), Izgara (`station2`), Burger (`station4`) ve Tatlı (`station5`) kategorileri yazdırılır. Sipariş kalemleri istasyonlarına yönlendirilir ve **her ürün satırı için ayrı, fiyatsız fiş** çıkar; miktar aynı fişte belirtilir. Kasa (`station3`) yazıcısı mutfak siparişi otomatik çıktısına dahil değildir; kasadan manuel yazdırılır. Tüm kasa ve mutfak fişleri Firestore'daki `counters/receipt-sequence` ortak, kalıcı sayacından numara alır (`00001`, `00002`, ...); bridge yeniden başlatıldığında sıra korunur.

## 📝 Notlar

- **ESC/POS uyumlu** termal yazıcılar önerilir (Epson, Star, Bixolon vb.)
- Yazıcı model ve sürücülerindeki ESC/POS karakter tabloları farklı olabildiğinden, bozuk karakterleri önlemek için Türkçe harfler ASCII karşılıklarıyla yazdırılır (`Ş` → `S`, `ı` → `i`); `₺` yerine `TL` kullanılır. Her fiş başlangıçta yazıcıyı ve satır aralığını sıfırlar; bitişte kağıdı kesip yazıcı durumunu yeniden sıfırlar.
- Yazıcılar macOS'a eklenmiş bir CUPS kuyruğu olarak görünmelidir
- Siparişler **pending** durumundayken yazdırılır
- Yeni sipariş otomatik olarak bir kez yazdırılır; tekrar çıktı yalnızca garsonun açıkça oluşturduğu istekle alınır
- Garson, mevcut sipariş detayından **Mutfağa Tekrar Gönder** ile aynı siparişin fişini yeniden yazdırma isteği oluşturabilir. Bu işlem yeni sipariş veya hesap oluşturmaz; her istasyon bridge'i kendi yazdırma sonucunu Firestore'a kaydeder. Bridge çevrimdışıysa istek Firestore'da bekler ve bridge bağlandığında işlenir. Yazıcının fiziksel olarak kağıt çıkardığı bridge tarafından garanti edilemez; gerekirse garson teyidiyle tekrar istek oluşturun.

## 🔐 Güvenlik

- `serviceAccountKey.json` dosyasını `.gitignore`'a ekleyin
- Bridge service sadece **lokal ağdan** erişilebilir
- Production'da VPN veya güvenli ağ kullanın

## 📞 Destek

Sorun yaşarsanız:
1. Konsol log'larını kontrol edin
2. `npm start` çıktısına bakın
3. Yazıcı durumunu kontrol edin

---

**Tuba Sofrası Restaurant Management System**  
Version 1.0.0
