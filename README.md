# Equilibre Planner

Application de bureau Windows pour planifier des **menus equilibres** (saison, repas legers) et un **planning d'activites physiques** adaptatif, en fonction de votre profil sante et de votre ressenti regulier.

## Fonctionnalites

- **Profil sante** : age, poids, allergies, conditions, objectifs
- **Menus hebdomadaires** : recettes, produits de saison (via IA locale)
- **Liste de courses** : generee automatiquement depuis le menu
- **Planning d'activites** : seances adaptees a votre etat de sante
- **Suivi regulier** : energie, humeur, sommeil, douleur, notes
- **Stockage local** : vos donnees restent sur votre PC

## Prerequis

- [Node.js](https://nodejs.org/) 20+
- [Ollama](https://ollama.com/download) installe et lance sur votre PC
- Un modele Ollama telecharge (ex. `ollama pull llama3.2`)

## Installation

```powershell
cd C:\Users\Philippe\equilibre-planner
npm install
```

## Configurer Ollama (gratuit)

1. Installez Ollama depuis [ollama.com/download](https://ollama.com/download).
2. Lancez l'application Ollama (service local sur le port 11434).
3. Telechargez un modele :
   ```powershell
   ollama pull llama3.2
   ```
4. Dans Equilibre Planner, ouvrez **Parametres** et cliquez **Verifier la connexion**.

Aucune cle API ni carte bancaire n'est necessaire.

## Lancer l'application (mode developpement)

```powershell
npm run electron:dev
```

Cela demarre l'interface React et la fenetre Electron.

## Utilisation

1. Renseignez votre **profil sante** (allergies, objectifs, contraintes).
2. Verifiez qu'**Ollama** est lance et qu'un modele est installe (**Parametres**).
3. Generez un **menu** et un **planning d'activites** (boutons avec IA).
4. Consultez la **liste de courses** generee automatiquement.
5. Notez votre **ressenti** regulierement pour affiner les prochaines generations.

## Build production

```powershell
npm run build
npm start
```

## Stack technique

- Electron (application de bureau)
- React + TypeScript + Vite
- Stockage JSON local (dossier utilisateur Electron)
- Ollama (IA locale gratuite) pour la generation de menus et d'activites

## Avertissement

Cette application fournit des suggestions generales. Elle ne remplace pas un avis medical ou nutritionnel professionnel.
