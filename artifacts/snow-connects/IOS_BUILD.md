# Snow Connects — iOS / TestFlight kurulum

Bu doküman, repoyu kendi makinende klonladıktan sonra iOS test build'ini almak
için adım adım talimatları içerir.

## Ön koşullar

- macOS (EAS Build cloud kullanırsan zorunlu değil)
- Apple Developer hesabı (yıllık $99) — TestFlight ve App Store için şart
- Node 20+ ve pnpm
- [EAS CLI](https://docs.expo.dev/build/setup/) — `npm i -g eas-cli`

## 1. Repoyu klonla ve bağımlılıkları kur

```bash
git clone https://github.com/tayfunyurdadon/snow-connects.git
cd snow-connects
pnpm install
```

## 2. Ortam değişkenlerini ayarla

`artifacts/snow-connects/.env` dosyası oluştur (committe atma — `.gitignore`'da):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
```

EAS Build için bu değerleri EAS Secrets'a da eklemen gerekecek:

```bash
cd artifacts/snow-connects
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxxx.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "eyJhbGc..."
```

## 3. EAS projesini bağla

```bash
cd artifacts/snow-connects
eas login                # Expo hesabınla gir
eas init                 # projectId'yi app.json'daki extra.eas.projectId'ye yazar
```

## 4. iOS Bundle Identifier ve Apple hesabı

`app.json` içinde bundle id şu an: `com.tayfunyurdadon.snowconnects`

Apple Developer Portal'da:
1. **Certificates, Identifiers & Profiles** → **Identifiers** → **+**
2. **App IDs** → **App** → bundle id olarak yukarıdakini gir
3. App Store Connect'te yeni uygulama oluştur (aynı bundle id ile)

`eas.json` içindeki `submit.production.ios` alanlarını doldur:
- `ascAppId`: App Store Connect'teki Apple ID (10 haneli)
- `appleTeamId`: Apple Developer Team ID

## 5. iOS Simulator için development build

```bash
cd artifacts/snow-connects
eas build --profile development --platform ios
```

Tamamlanınca verilen `.tar.gz` veya `.app` dosyasını simulator'a sürükle.

## 6. TestFlight için preview / production build

```bash
eas build --profile production --platform ios
```

EAS sana Apple kimlik bilgilerini soracak (ilk seferde) — Apple ID + uygulama-bazlı
şifre. Bitince `.ipa` üretir.

Submit:

```bash
eas submit --profile production --platform ios --latest
```

Bu komut .ipa'yı App Store Connect'e yükler. TestFlight processing 10-30 dk sürer.

## Notlar

- `newArchEnabled: true` — RN New Architecture aktif. Bağımlılıklarla uyum sorunu
  çıkarsa geçici olarak `false` yap.
- `expo-notifications@55.0.22` Expo SDK ile tam uyumlu değil; üretim build'inden
  önce `pnpm --filter @workspace/snow-connects add expo-notifications@~0.32.17` ile
  güncelle.
- Supabase'in **public** anon key'i build içine gömülür — bu güvenli (RLS bunu
  varsayar). **Service role key** asla cliente eklenmemeli.
- Apple gizlilik beyanı (App Privacy) doldururken: Email, ad, telefon (rezervasyon),
  ödeme bilgisi (Param.com — third-party), konum (yakındaki pistler — opsiyonel).
