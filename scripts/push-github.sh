#!/usr/bin/env bash
# Reemplaza el contenido de tu repo de GitHub por el repo CORRECTO (sitio en la raíz).
# Uso:  bash scripts/push-github.sh [URL_DEL_REPO]
# Ejem: bash scripts/push-github.sh https://github.com/gabi7202/sinaptia.git
set -euo pipefail

URL="${1:-https://github.com/gabi7202/sinaptia.git}"
RAMA="$(git rev-parse --abbrev-ref HEAD)"

echo "→ Repo:  $URL"
echo "→ Rama:  $RAMA"
echo "→ HEAD:  $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s | cut -c1-60)"

if [ ! -f package.json ] || [ ! -d src/pages ]; then
  echo "✗ Esto no parece la raíz del proyecto (falta package.json o src/pages)."
  echo "  Ejecuta el script desde la carpeta que clonaste del bundle."
  exit 1
fi

git remote get-url origin >/dev/null 2>&1 \
  && git remote set-url origin "$URL" \
  || git remote add origin "$URL"

echo "→ Verifico que la portada existe en el commit..."
git cat-file -e "HEAD:src/pages/index.astro" || { echo "✗ Falta src/pages/index.astro"; exit 1; }
echo "  ok: src/pages/index.astro"

echo "→ Subiendo (forzado: reemplaza el commit equivocado)..."
git push -f -u origin "$RAMA"

echo "✓ Listo. En Vercel: Settings → General → Root Directory = (vacío), luego Deploy → Redeploy."
