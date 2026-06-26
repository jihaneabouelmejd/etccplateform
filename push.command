#!/bin/bash
cd "$(dirname "$0")"
git push origin main
echo ""
echo "✅ Push terminé ! Railway va redéployer automatiquement."
read -p "Appuie sur Entrée pour fermer..."
