//const cors = require('cors');

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const session = require('express-session'); // <-- DÉPLACÉ ICI !
const User = require('./models/user');
const Executable = require('./models/executable');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const app = express();

// --- CONFIGURATION / MIDDLEWARES ---
// Autorise ton site Netlify à communiquer avec ce serveur
//app.use(cors({
//    origin: 'https://source-installers.netlify.app',
//    credentials: true // Important pour les sessions !
//}));

//app.use(express.static(__dirname)); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration de la session (Placée AVANT les routes)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // mettra true plus tard si HTTPS
        httpOnly: true,
        maxAge: 3600000
    }
}));

// --- CONNEXION MONGODB ---
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("🚀 Connecté à MongoDB !"))
.catch(err => console.error("❌ Erreur Mongo :", err.message));

// --- CONFIGURATION MULTER ---
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- ROUTES ---


// 1. L'étape 1 : On reçoit le .exe et on renvoie son ID
app.post('/upload-exe', upload.single('logiciel'), async (req, res) => {
    try {
        // Sécurité : On vérifie si l'utilisateur est connecté
        if (!req.session.userId) {
            return res.status(401).send("Vous devez être connecté pour publier.");
        }

        const nouveauExe = new Executable({
            nom: req.file.originalname,
            nomFichier: req.file.filename,
            taille: req.file.size,
            uploader: req.session.userId // Maintenant req.session existera bien !
        });

        const sauvé = await nouveauExe.save();
        res.status(201).json({ id: sauvé.id }); 
    } catch (error) {
        console.error("Erreur serveur :", error);
        res.status(500).send("Erreur upload : " + error.message);
    }
});

// 2. L'étape 2 : Le bouton "Enregistrer et Publier" appelle cette route
app.post('/update-setup/:id', upload.fields([
    { name: 'image-icone', maxCount: 1 },
    { name: 'images-usage', maxCount: 5 }
]), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {
            description: req.body.description,
            cible: req.body.cible,
            icone: req.files['image-icone'] ? req.files['image-icone'][0].filename : '',
            imagesUsage: req.files['images-usage'] ? req.files['images-usage'].map(f => f.filename) : []
        };
        await Executable.findByIdAndUpdate(id, updates);
        res.send("Détails enregistrés !");
    } catch (error) {
        res.status(500).send(error.message);
    }
});


app.get('/setup/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Vérifie si l'ID a le bon format MongoDB (24 caractères hexadécimaux)
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).send("ID invalide");
        }
        const setup = await Executable.findById(id).populate('uploader');
        res.json(setup);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// ROUTE : Téléchargement et Incrémentation
app.get('/download/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. On cherche le setup et on augmente le compteur de 1 ($inc)
        const setup = await Executable.findByIdAndUpdate(
            id, 
            { $inc: { downloads: 1 } }, // Incrémente la propriété 'downloads'
            { new: true } // Renvoie l'objet mis à jour
        );

        if (!setup) return res.status(404).send("Fichier introuvable.");

        // 2. On définit le chemin du fichier sur le serveur
        const cheminFichier = path.join(__dirname, 'uploads', setup.nomFichier);

        // 3. On déclenche le téléchargement côté client
        // res.download prend (chemin_du_fichier, nom_voulu_par_l_utilisateur)
        res.download(cheminFichier, setup.nom); 

    } catch (error) {
        res.status(500).send("Erreur lors du téléchargement : " + error.message);
    }
});

const PORT = process.env.PORT || 3000;

// INSCRIPTION
// INSCRIPTION SÉCURISÉE
app.post('/inscription', async (req, res) => {
    try {
        const { email, mot_de_passe, nom, identite, universite, niveau } = req.body;
        
        // 1. On vérifie si l'adresse mail est déjà prise
        const existant = await User.findOne({ email });
        if (existant) return res.status(400).send("Email déjà utilisé");

        // 2. On hache le mot de passe (le chiffre 10 représente la complexité du hachage)
        const motDePasseHache = await bcrypt.hash(mot_de_passe, 10);

        // 3. On enregistre le compte avec le mot de passe haché
        const nouvelUtilisateur = new User({ 
            email, 
            mot_de_passe: motDePasseHache, // <-- On stocke le hachage !
            nom, 
            identite, 
            universite, 
            niveau 
        });
        await nouvelUtilisateur.save();
        
        req.session.userId = nouvelUtilisateur.id; // Connexion automatique
        res.redirect('/page_accueil.html');
    } catch (e) { 
        res.status(500).send("Erreur lors de l'inscription : " + e.message); 
    }
});

// CONNEXION SÉCURISÉE
app.post('/connexion', async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;
        
        // 1. On cherche l'utilisateur par son email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).send("Identifiants incorrects");
        }

        // 2. On compare le mot de passe tapé avec celui de la BDD
        const motDePasseValide = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
        
        if (motDePasseValide) {
            req.session.userId = user.id;
            res.redirect('/page_accueil.html');
        } else {
            res.status(401).send("Identifiants incorrects");
        }
    } catch (error) {
        res.status(500).send("Erreur lors de la connexion.");
    }
});

// ROUTE : Déconnexion sécurisée
app.get('/deconnexion', (req, res) => {
    // 1. On détruit la session côté serveur
    req.session.destroy((err) => {
        if (err) {
            console.error("Erreur lors de la destruction de la session :", err);
            return res.status(500).send("Erreur lors de la déconnexion.");
        }

        // 2. On supprime le cookie de session sur le navigateur (le nom par défaut est 'connect.sid')
        res.clearCookie('connect.sid');

        // 3. On redirige vers la page de connexion
        res.redirect('/connexion.html');
    });
});

// ÉTAPE 1 : Demander la réinitialisation et envoyer l'e-mail
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        // On vérifie si l'utilisateur existe vraiment
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send("Aucun compte n'est associé à cet e-mail.");
        }

        const code = Math.floor(1000 + Math.random() * 9000); // Génère 4 chiffres
        req.session.resetCode = code;
        req.session.resetEmail = email;

        // Préparation du mail
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Source - Votre code de récupération',
            text: `Bonjour ${user.nom},\n\nVoici votre code secret de récupération : ${code}\nCe code est valable pour votre session actuelle.`
        };

        // Envoi du mail
        await transporter.sendMail(mailOptions);
        
        // On redirige vers une page où il pourra taper son code
        res.redirect('/entrer_code.html');
        
    } catch (error) {
        console.error("Erreur d'envoi mail :", error);
        res.status(500).send("Erreur lors de l'envoi de l'e-mail.");
    }
});

// ÉTAPE 2 : Vérifier le code et changer le mot de passe (SÉCURISÉ)
app.post('/reset-password', async (req, res) => {
    try {
        const { code, nouveau_pass } = req.body;

        if (code == req.session.resetCode) {
            
            // Hachage du nouveau mot de passe
            const nouveauPassHache = await bcrypt.hash(nouveau_pass, 10);

            await User.findOneAndUpdate(
                { email: req.session.resetEmail }, 
                { mot_de_passe: nouveauPassHache } // <-- On stocke le nouveau hachage !
            );

            delete req.session.resetCode; 
            delete req.session.resetEmail;

            res.send("<script>alert('Mot de passe modifié avec succès !'); window.location.href='/connexion.html';</script>");
        } else {
            res.status(400).send("Code de récupération incorrect.");
        }
    } catch (error) {
        res.status(500).send("Erreur lors de la réinitialisation.");
    }
});

// ROUTE : Récupérer les fichiers d'un utilisateur spécifique
app.get('/user-setups/:uid', async (req, res) => {
    try {
        const { uid } = req.params;

        // 1. On vérifie si l'ID est valide pour MongoDB
        if (!mongoose.Types.ObjectId.isValid(uid)) {
            return res.status(400).send("ID Utilisateur invalide");
        }

        // 2. On récupère les infos de l'utilisateur
        const user = await User.findById(uid);
        if (!user) return res.status(404).send("Utilisateur non trouvé");

        // 3. On récupère ses fichiers
        const setups = await Executable.find({ uploader: uid }).sort({ dateUpload: -1 });

        res.json({
            createur: user.nom,
            setups: setups
        });
    } catch (error) {
        res.status(500).send("Erreur serveur : " + error.message);
    }
});

app.get('/liste-exe', async (req, res) => {
    try {
        const exes = await Executable.find()
            .populate('uploader') // Pour avoir le nom du créateur
            .sort({ downloads: -1 }); // -1 = du plus grand au plus petit
        res.json(exes);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(PORT, () => console.log(`✅ Serveur prêt sur http://localhost:${PORT}`));