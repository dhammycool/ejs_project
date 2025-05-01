import multer from "multer";
import path from "path"; // ✅ Import path module

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1000000 }, 
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeTypes = ["image/jpeg", "image/png", "image/gif","image/jpg"];
        
        if (!extName || !mimeTypes.includes(file.mimetype)) {
            return cb(new Error("Only images are allowed (JPEG, JPG, PNG, GIF)"));
        }
        
        cb(null, true);
    }
}) .single('serviceImage')

export default upload;