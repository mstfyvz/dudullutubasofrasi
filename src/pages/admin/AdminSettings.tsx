import { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Printer, RefreshCw, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, db } from '../../lib/firebase';
import { usePrinterStore } from '../../stores/printerStore';

const KITCHEN_STATIONS = [
  { id: 'station1', label: 'Fırın' },
  { id: 'station2', label: 'Izgara' },
  { id: 'station3', label: 'Kasa' },
  { id: 'station4', label: 'Burger' },
  { id: 'station5', label: 'Tatlı' },
];
const BRIDGE_ONLINE_TIMEOUT_MS = 90_000;
const BRIDGE_STATUS_REFRESH_MS = 10_000;

type BridgeCheck = {
  status: 'connected' | 'error';
  message: string;
};

export default function AdminSettings() {
  const { settings, subscribe, update, fetchAvailablePrinters, availablePrinters } = usePrinterStore();
  const [saving, setSaving] = useState(false);
  const [testingStation, setTestingStation] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [bridgeUrls, setBridgeUrls] = useState<Record<string, string>>({});
  const [stationMapping, setStationMapping] = useState<Record<string, string>>({});
  const [bridgeChecks, setBridgeChecks] = useState<Record<string, BridgeCheck>>({});
  const [lastReceiptNumber, setLastReceiptNumber] = useState<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resettingCounter, setResettingCounter] = useState(false);
  const [liveBridgeStatuses, setLiveBridgeStatuses] = useState<Record<string, { online: boolean; printerName?: string; availablePrinters?: string[]; lastPingDate?: Date }>>({});

  useEffect(() => subscribe(), [subscribe]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bridgeStatus'), (snap) => {
      const statuses: Record<string, { online: boolean; printerName?: string; availablePrinters?: string[]; lastPingDate?: Date }> = {};
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        let pingDate: Date | null = null;
        if (data.lastPing instanceof Timestamp) pingDate = data.lastPing.toDate();
        else if (data.lastPing && typeof data.lastPing === 'object' && 'toDate' in data.lastPing) pingDate = (data.lastPing as { toDate: () => Date }).toDate();
        else if (data.lastPing instanceof Date) pingDate = data.lastPing;

        const isOnline = pingDate ? (Date.now() - pingDate.getTime() < BRIDGE_ONLINE_TIMEOUT_MS) : false;
        statuses[docSnap.id] = {
          online: isOnline,
          printerName: data.printerName,
          availablePrinters: Array.isArray(data.availablePrinters) ? data.availablePrinters : [],
          lastPingDate: pingDate ?? undefined,
        };
      });
      setLiveBridgeStatuses(statuses);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setLiveBridgeStatuses((previous) => {
        let changed = false;
        const next = Object.entries(previous).map(([stationId, status]) => {
          const online = !!status.lastPingDate
            && currentTime - status.lastPingDate.getTime() < BRIDGE_ONLINE_TIMEOUT_MS;
          if (online === status.online) return [stationId, status] as const;
          changed = true;
          return [stationId, { ...status, online }] as const;
        });
        return changed ? Object.fromEntries(next) : previous;
      });
    }, BRIDGE_STATUS_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'counters', 'receipt-sequence'),
      (snapshot) => {
        const lastNumber: unknown = snapshot.data()?.lastNumber ?? 0;
        if (typeof lastNumber !== 'number' || !Number.isInteger(lastNumber) || lastNumber < 0) {
          toast.error('Fiş numarası sayacı geçersiz.');
          return;
        }
        setLastReceiptNumber(lastNumber);
      },
      (error) => {
        console.error('Fiş numarası sayacı okunamadı:', error);
        toast.error('Fiş numarası sayacı okunamadı. Admin yetkinizi kontrol edin.');
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    setEnabled(settings.enabled);
    setBridgeUrls(Object.fromEntries(KITCHEN_STATIONS.map(({ id }) => [
      id,
      settings.bridgeUrls?.[id] ?? (
        settings.bridgeUrls ? '' : settings.bridgeUrl || 'http://localhost:3001'
      ),
    ])));
    setStationMapping(Object.fromEntries(KITCHEN_STATIONS.map(({ id }) => [
      id,
      settings.stationMapping?.[id] ?? '',
    ])));
  }, [settings]);

  const allAvailablePrinters = Array.from(new Set([
    ...availablePrinters,
    ...Object.values(liveBridgeStatuses).flatMap((status) => status.availablePrinters ?? []),
  ]));

  const handleTestConnection = async (stationId: string) => {
    const stationLabel = KITCHEN_STATIONS.find((station) => station.id === stationId)?.label ?? stationId;
    const bridgeUrl = bridgeUrls[stationId]?.trim().replace(/\/+$/, '');
    if (!bridgeUrl) {
      toast.error('Önce bu istasyonun Bridge adresini girin.');
      return;
    }

    setTestingStation(stationId);
    setBridgeChecks((previous) => {
      const next = { ...previous };
      delete next[stationId];
      return next;
    });

    const liveStatus = liveBridgeStatuses[stationId];

    try {
      const [healthResponse, printers] = await Promise.all([
        fetch(`${bridgeUrl}/`),
        fetchAvailablePrinters(bridgeUrl),
      ]);
      if (!healthResponse.ok) throw new Error('Bridge servise ulaşılamadı.');
      const health: { station?: unknown; printer?: unknown } = await healthResponse.json();
      const isCentralBridge = health.station === null;
      if (health.station !== stationId && !isCentralBridge) {
        throw new Error('Bu bilgisayardaki Bridge yanlış istasyona ayarlı. BRIDGE_STATION değerini kontrol edin.');
      }
      const printerName = isCentralBridge ? stationMapping[stationId]?.trim() : health.printer;
      if (typeof printerName !== 'string' || !printerName) {
        throw new Error('Bu istasyona henüz bir Windows yazıcı kuyruğu atanmadı.');
      }
      if (!printers.includes(printerName)) {
        throw new Error(`${printerName} Windows yazıcı listesinde görünmüyor. Yazıcı kuyruğunu ve ağ bağlantısını kontrol edin.`);
      }

      const message = `Bağlandı. İstasyon yazıcısı: ${printerName}. Yerel yazıcılar: ${printers.join(', ')}`;
      setBridgeChecks((previous) => ({
        ...previous,
        [stationId]: { status: 'connected', message },
      }));
      toast.success(`${stationLabel} Bridge bağlantısı başarılı.`);
    } catch (error) {
      let message = error instanceof Error ? error.message : 'Bridge servise bağlanılamadı.';
      if (
        error instanceof TypeError
        && window.location.protocol === 'https:'
        && bridgeUrl.startsWith('http://')
      ) {
        message = liveStatus?.online
          ? 'Firestore heartbeat Bridge’in çevrimiçi olduğunu gösteriyor; ancak tarayıcı HTTP kısıtı nedeniyle girilen URL ve yazıcı kuyruğu doğrulanamadı.'
          : 'Tarayıcı HTTPS üzerinden HTTP Bridge adresini doğrulamayı engelledi. Firestore heartbeat gelmeden bu URL test edilemez.';
      }
      setBridgeChecks((previous) => ({
        ...previous,
        [stationId]: { status: 'error', message },
      }));
      toast.error(message, { duration: 6000 });
    } finally {
      setTestingStation(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await update({
        enabled,
        bridgeUrls: Object.fromEntries(KITCHEN_STATIONS.map(({ id }) => [
          id,
          bridgeUrls[id]?.trim().replace(/\/+$/, '') || '',
        ])),
        stationMapping: Object.fromEntries(KITCHEN_STATIONS.map(({ id }) => [
          id,
          stationMapping[id]?.trim() || '',
        ])),
      });
      toast.success('Ayarlar kaydedildi.');
    } catch (error) {
      toast.error(`Kaydedilemedi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetReceiptNumber = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      toast.error('Oturum bulunamadı. Tekrar giriş yapın.');
      return;
    }

    setResettingCounter(true);
    try {
      const counterRef = doc(db, 'counters', 'receipt-sequence');
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(counterRef);
        const currentLastNumber: unknown = snapshot.data()?.lastNumber ?? 0;
        if (
          typeof currentLastNumber !== 'number'
          || !Number.isInteger(currentLastNumber)
          || currentLastNumber < 0
        ) {
          throw new Error('Fiş numarası sayacı geçersiz; sıfırlama yapılamadı.');
        }
        transaction.set(counterRef, {
          lastNumber: 0,
          resetAt: serverTimestamp(),
          resetBy: userId,
        }, { merge: true });
      });
      toast.success('Fiş numarası sıfırlandı. Sonraki fiş 00001 olacak.');
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Fiş numarası sıfırlanamadı:', error);
      toast.error(`Fiş numarası sıfırlanamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    } finally {
      setResettingCounter(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Yazıcı Ayarları</h1>
        <p className="text-sm text-gray-500">
          Tek bilgisayardaki Bridge adresini tüm istasyonlara girin ve her istasyon için Windows yazıcı kuyruğunu seçin.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="w-5 h-5 rounded accent-brand-600"
          />
          <div className="flex-1">
            <span className="font-medium text-gray-900 block">Otomatik Yazdırma</span>
            <span className="text-sm text-gray-500">Yeni siparişler ilgili istasyonun Bridge servisine gönderilir.</span>
          </div>
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3">İstasyon → Windows Yazıcısı</h2>
        <div className="flex flex-col gap-5">
          {KITCHEN_STATIONS.map((station) => {
            const check = bridgeChecks[station.id];
            const isTesting = testingStation === station.id;
            return (
              <div key={station.id}>
                <label htmlFor={`bridge-${station.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                  {station.label}
                </label>
                <div className="flex gap-2">
                  <input
                    id={`bridge-${station.id}`}
                    type="url"
                    value={bridgeUrls[station.id] ?? ''}
                    onChange={(event) => setBridgeUrls((previous) => ({
                      ...previous,
                      [station.id]: event.target.value,
                    }))}
                    className="input flex-1"
                    placeholder="http://192.168.1.160:3001"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestConnection(station.id)}
                    disabled={saving || testingStation !== null}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
                    Test
                  </button>
                </div>
                <label htmlFor={`printer-${station.id}`} className="block text-xs font-medium text-gray-600 mt-2 mb-1">
                  Windows yazıcı kuyruğu
                </label>
                <select
                  id={`printer-${station.id}`}
                  value={stationMapping[station.id] ?? ''}
                  onChange={(event) => setStationMapping((previous) => ({
                    ...previous,
                    [station.id]: event.target.value,
                  }))}
                  className="input"
                >
                  <option value="">Yazıcı seçin</option>
                  {allAvailablePrinters.map((printer) => (
                    <option key={printer} value={printer}>{printer}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Test düğmesi Bridge bağlantısını kontrol eder; kuyruk adları Windows’taki yazıcı listesinden alınır.
                </p>
                {check && (
                  <div className={`flex items-start gap-2 mt-2 text-sm ${check.status === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                    {check.status === 'connected'
                      ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                    <span>{check.message}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
        <div className="flex gap-3">
          <Printer className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Tek Bridge bilgisayarı</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Tüm ağ yazıcılarını Windows’a TCP/IP yazıcısı olarak ekleyin.</li>
              <li>Aynı Windows bilgisayarının Bridge adresini tüm istasyonlara girin.</li>
              <li>Bridge `.env` dosyasında `BRIDGE_STATION` ve `PRINTER_NAME` boş kalmalı; kuyrukları bu ekrandan seçin.</li>
              <li>Kategorileri Ürünler sayfasında Fırın, Izgara, Burger veya Tatlı istasyonuna atayın.</li>
            </ul>
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || testingStation !== null}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Kaydediliyor…' : 'Ayarları Kaydet'}
      </button>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 mt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Fiş Numarası</h2>
            <p className="text-sm text-gray-500 mt-1">
              Son kullanılan numara: <strong>{lastReceiptNumber === null ? 'Yükleniyor…' : String(lastReceiptNumber).padStart(5, '0')}</strong>
            </p>
            <p className="text-xs text-gray-500 mt-1">Sıfırlama sonrası sıradaki fiş 00001 numarasını alır.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            disabled={lastReceiptNumber === null || resettingCounter}
            className="btn-secondary flex items-center gap-2 text-red-700 border-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Sıfırla
          </button>
        </div>
      </section>

      {showResetConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !resettingCounter && setShowResetConfirm(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <TriangleAlert className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Fiş numarası sıfırlansın mı?</h3>
                <p className="text-sm text-gray-600 mt-2">
                  Sayaç sıfırlanacak ve sonraki fiş <strong>00001</strong> numarasıyla başlayacak.
                  Bu işlem önceki numaraların yeniden kullanılmasına neden olabilir.
                </p>
                <p className="text-sm text-red-700 font-medium mt-2">
                  Yazıcılar fiş basarken sıfırlamayın; aynı numaranın tekrar verilmesini önlemek için yazdırmanın durduğundan emin olun.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={resettingCounter}
                className="btn-secondary flex-1"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void handleResetReceiptNumber()}
                disabled={resettingCounter}
                className="btn-danger flex-1 disabled:opacity-50"
              >
                {resettingCounter ? 'Sıfırlanıyor…' : 'Evet, sıfırla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
