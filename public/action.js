
async function chargerSetups() {
    const res = await fetch(`/liste-exe`);
    const setups = await res.json();
    const grid = document.getElementById('exe-grid');
    grid.innerHTML = '';

    setups.forEach(setup => {
        const initiale = setup.uploader ? setup.uploader.nom.charAt(0).toUpperCase() : '?';
        const card = document.createElement('div');
        card.className = 'exe-card';
        card.innerHTML = `
            <div class="user-badge" onclick="window.location.href='personal_setup.html?uid=${setup.uploader.id}'">
                ${initiale}
            </div>
            <img src="${setup.icone}" class="icon" alt="icon">
            <div class="title">${setup.nom}</div>
            <div class="stats">📥 ${setup.downloads} téléchargements</div>
            <button class="bouton" onclick="telecharger('${setup.id}')">Télécharger</button>
        `;
        grid.appendChild(card);
    });
}

function telecharger(id) {
    // On appelle une route qui augmente le compteur et lance le téléchargement
    window.location.href = `/download/${id}`;
}

// --- Fonctions Thème ---
function jour_et_nuit(){
    const body = document.body;
    body.classList.toggle('dark-theme');
    localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
}

function initTheme(){
    const savedTheme = localStorage.getItem('theme');
    if(savedTheme === 'dark') document.body.classList.add('dark-theme');
}

// --- Logique principale ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    const dropZone = document.getElementById('drop-zone');
    const grid = document.getElementById('exe-grid');

    if (!dropZone) {
        console.error("Erreur : La zone de dépôt n'a pas été trouvée dans le HTML.");
        return;
    }

    // Empêcher le comportement par défaut du navigateur (qui ouvrirait le fichier)
    ['dragover', 'drop'].forEach(evt => {
        window.addEventListener(evt, e => e.preventDefault());
    });

    // Effet visuel
    dropZone.ondragover = () => { dropZone.classList.add('hover'); return false; };
    dropZone.ondragleave = () => { dropZone.classList.remove('hover'); return false; };

    // Gestion du dépôt
    dropZone.ondrop = async (e) => {
        e.preventDefault();
        dropZone.classList.remove('hover');
        
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!file.name.endsWith('.exe')) return alert("Seuls les fichiers .exe sont acceptés !");

        const formData = new FormData();
        formData.append('logiciel', file);

        const res = await fetch(`/upload-exe`, { method: 'POST', body: formData, credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            console.log("Contenu de data reçu :", data);
            alert("Fichier reçu ! Configurons les détails...");
            window.location.href = `ajouter_setup.html?id=${data.id}`; // Redirection magique
        }else{
            // On récupère le texte de l'erreur envoyé par le serveur
            const errorText = await res.text(); 
            alert("Erreur : " + errorText);
        };
    }

    // --- Système de Recherche et Affichage ---
    let tousLesSetups = []; // On crée une boîte pour stocker TOUS les setups en mémoire

    // Fonction 1 : Elle s'occupe UNIQUEMENT de dessiner les cartes dans la grille
    function afficherListe(listeAffichee) {
        if (listeAffichee.length === 0) {
            grid.innerHTML = "<p style='color:gray'>Aucun setup ou utilisateur ne correspond à votre recherche.</p>";
            return;
        }

        grid.innerHTML = listeAffichee.map(exe => {
            const initiale = exe.uploader ? exe.uploader.nom.charAt(0).toUpperCase() : '?';
            const nomUploader = exe.uploader ? exe.uploader.nom : 'Anonyme';
            const uploaderId = exe.uploader ? (exe.uploader._id || exe.uploader.id) : '';

            return `
            <div class="exe-card" onclick="window.location.href='description_setup.html?id=${exe._id || exe.id}'" style="cursor:pointer">
                
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;" 
                     onclick="event.stopPropagation(); window.location.href='personal_setup.html?uid=${uploaderId}'">
                    <div class="user-badge" style="width: 30px; height: 30px; font-size: 1rem; cursor: pointer;">
                        ${initiale}
                    </div>
                    <span style="font-size: 0.8rem; color: #666; font-weight: bold;">${nomUploader}</span>
                </div>

                <img src="${exe.icone || ''}" style="width:50px; height:50px; margin-bottom:10px;" alt="📦">
                <div class="title" style="font-weight: bold;">${exe.nom}</div>
                <div style="font-size:10px; color:#888;">${(exe.taille / 1024 / 1024).toFixed(2)} MB</div>
            </div>
            `;
        }).join('');
    }

    // Fonction 2 : Elle télécharge les données depuis le serveur une seule fois
    async function chargerListe() {
        const res = await fetch(`/liste-exe`);
        tousLesSetups = await res.json(); // On remplit notre boîte globale
        afficherListe(tousLesSetups); // On affiche tout au début
    }

    // Fonction 3 : Écouteur d'événement sur la barre de recherche
    const barreRecherche = document.getElementById('recherche');
    if (barreRecherche) {
        barreRecherche.addEventListener('input', (e) => {
            const texteRecherche = e.target.value.toLowerCase(); // On passe tout en minuscules

            // C'est ici que la magie opère !
            const resultatsFiltres = tousLesSetups.filter(exe => {
                const nomSetup = exe.nom.toLowerCase();
                const nomUploader = exe.uploader ? exe.uploader.nom.toLowerCase() : '';

                // Le setup correspond si le texte recherché est dans le titre OU dans le nom de l'auteur
                return nomSetup.includes(texteRecherche) || nomUploader.includes(texteRecherche);
            });

            // On redessine la grille avec uniquement les éléments filtrés
            afficherListe(resultatsFiltres);
        });
    }

    // Lancement au chargement de la page
    chargerListe();

}); 
 

 
