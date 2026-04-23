const mongoose = require('mongoose');

const ExecutableSchema = new mongoose.Schema({
    nom: String,
    nomFichier: String,
    taille: Number,
    description: String,
    icone: String,
    imagesUsage: [String],
    // NOUVEAU : On lie le setup à un utilisateur
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // NOUVEAU : Compteur de téléchargements
    downloads: { type: Number, default: 0 },
    dateUpload: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Executable', ExecutableSchema);