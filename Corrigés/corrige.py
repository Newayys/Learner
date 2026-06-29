import os
from pathlib import Path

# Dossier contenant les PDF
DOSSIER = Path(".")

# Préfixes (à adapter si besoin)
PREFIXES = ["BT_SIA", "BT_SIB", "BT_SIC"]

# Années (du plus ancien au plus récent fichier => 2023 -> 2013)
ANNEES = list(range(2023, 2012, -1))  # 2023 à 2013 inclus

# Récupérer les PDF
fichiers = [f for f in DOSSIER.glob("*.pdf") if f.is_file()]

# Trier par date de modification (du plus ancien au plus récent)
fichiers.sort(key=lambda f: f.stat().st_mtime)

# Vérification simple
if len(fichiers) != len(ANNEES) * len(PREFIXES):
    print(f"⚠️ Attention : {len(fichiers)} fichiers pour {len(ANNEES) * len(PREFIXES)} noms attendus")

index = 0

for annee in ANNEES:
    for prefix in PREFIXES:
        if index >= len(fichiers):
            break

        ancien_fichier = fichiers[index]
        nouveau_nom = f"{prefix}_{annee}.pdf"
        nouveau_chemin = DOSSIER / nouveau_nom

        print(f"{ancien_fichier.name} -> {nouveau_nom}")
        ancien_fichier.rename(nouveau_chemin)

        index += 1