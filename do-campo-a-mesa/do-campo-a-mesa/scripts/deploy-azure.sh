#!/usr/bin/env bash
# Passo 8: publicar a API (App Service), as imagens (Blob Storage) e a SPA (Static Web Apps) no Azure.
# Requisitos: Azure CLI com sessão iniciada (az login), Node 20, zip.
# Uso: MONGODB_URI="mongodb+srv://..." ./scripts/deploy-azure.sh
set -euo pipefail

RG=${RG:-dcm-rg}
LOCAL=${LOCAL:-westeurope}
PLANO=${PLANO:-dcm-plan}
API=${API:-dcm-api-$RANDOM}
WEB=${WEB:-dcm-web}
STORAGE=${STORAGE:-dcmimagens$RANDOM}
: "${MONGODB_URI:?Defina MONGODB_URI com a connection string do MongoDB Atlas}"
JWT_SECRET=${JWT_SECRET:-$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")}

cd "$(dirname "$0")/.."

az group create -n "$RG" -l "$LOCAL"

# Imagens: conta de armazenamento com leitura pública dos blobs
az storage account create -n "$STORAGE" -g "$RG" -l "$LOCAL" --sku Standard_LRS --allow-blob-public-access true
az storage container create -n produtos --account-name "$STORAGE" --public-access blob
STORAGE_CONN=$(az storage account show-connection-string -n "$STORAGE" -g "$RG" -o tsv)

# SPA: Static Web Apps (PaaS de ficheiros estáticos com CDN e HTTPS)
az staticwebapp create -n "$WEB" -g "$RG" -l "$LOCAL"
WEB_URL="https://$(az staticwebapp show -n "$WEB" -g "$RG" --query defaultHostname -o tsv)"

# API: App Service Linux B1 (o F1 limita as ligações WebSocket)
az appservice plan create -n "$PLANO" -g "$RG" --sku B1 --is-linux
az webapp create -n "$API" -g "$RG" -p "$PLANO" --runtime "NODE:20-lts"
az webapp config appsettings set -n "$API" -g "$RG" --settings \
  NODE_ENV=production MONGODB_URI="$MONGODB_URI" JWT_SECRET="$JWT_SECRET" JWT_EXPIRES_IN=2h \
  CLIENT_URL="$WEB_URL" STORAGE_CONN="$STORAGE_CONN" STORAGE_CONTAINER=produtos \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
az webapp config set -n "$API" -g "$RG" --web-sockets-enabled true --startup-file "npm start"
az webapp update -n "$API" -g "$RG" --https-only true

(cd api && rm -f ../api.zip && zip -r ../api.zip . -x "node_modules/*" ".env" "uploads/*" "test/*")
az webapp deploy -n "$API" -g "$RG" --src-path api.zip --type zip
API_URL="https://$(az webapp show -n "$API" -g "$RG" --query defaultHostName -o tsv)"

# Build da SPA apontada para a API publicada
(cd web && printf "VITE_API_URL=%s\nVITE_USAR_DADOS_SIMULADOS=false\n" "$API_URL" > .env.production && npm ci && npm run build)
TOKEN=$(az staticwebapp secrets list -n "$WEB" -g "$RG" --query "properties.apiKey" -o tsv)
npx --yes @azure/static-web-apps-cli deploy ./web/dist --deployment-token "$TOKEN" --env production

echo
echo "SPA:     $WEB_URL"
echo "API:     $API_URL/api/health"
echo "Swagger: $API_URL/api-docs"
echo "Lembre-se de autorizar o acesso a partir do Azure no Network Access do MongoDB Atlas."
