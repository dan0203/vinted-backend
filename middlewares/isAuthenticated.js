const User = require('../models/User');

const isAuthenticated = async (req, res, next) => {
    // Vérifier qu'il y a bien un token transmis
    if (!req.headers.authorization) {
        return res.status(401).json('Unauthorized');
    }

    const token = req.headers.authorization.replace('Bearer ', '');
    // On va chercher en DB si il y a bien un user dont le token correspond à ce qu'on m'a envoyé
    // User.findOne({token: ...})
    const user = await User.findOne({ token: token }).select('email account'); // _id est toujours ajouté sauf si explicitement retiré (-_id)

    // Si je n'en trouve pas 401 Unauthorized
    if (!user) {
        return res.status(401).json('Unauthorized');
    }

    // Si j'en trouve un => C'est ok la personne a le droit d'interroger la route
    // le req du middleware étant le même objet que le req du controller, je peux passer des infos au controller comme suit
    req.user = user;

    // next permet de passer au middleware suivant
    next();
};

module.exports = isAuthenticated;
