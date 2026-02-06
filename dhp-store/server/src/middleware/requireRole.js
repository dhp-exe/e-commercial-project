export function verifyAdmin(req, res, next) {  
    if (req.user.role === 'admin') {
        next();
    } 
    else {
        return res.status(403).json({ message: "Access denied. Admins only." });
    }
}

export function verifyStaff(req, res, next) {
    if (req.user.role === 'admin' || req.user.role === 'staff') {
        next();
    } 
    else {
        return res.status(403).json({ message: "Access denied. Staff only." });
    }
}