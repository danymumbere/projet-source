const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    email: { type: String, required: true, unique: true }, // unique évite les doublons
    mot_de_passe: { type: String, required: true },
    identite: { type: String }, // Etudiant ou Autre
    universite: { type: String },
    niveau: { type: String }
});

module.exports = mongoose.model('User', UserSchema);