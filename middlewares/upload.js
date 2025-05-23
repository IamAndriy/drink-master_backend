const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

const storage = new CloudinaryStorage({
  
  cloudinary: cloudinary,
  
  params: async (req, file) => {
    
    let folder;

    if (file.fieldname === 'avatar') {
      folder = 'avatars';
    } else if (file.fieldname === "drinkThumb") {
      folder = "drinks";
    } else {
      folder = "others";
    }

    return {
      folder: folder,
      allowed_formats: ["jpeg", "jpg", "png", "avif", "bmp", "webp"], 
      public_id: file.originalname,    
      transformation: [
        { height: 350, crop: "scale" },
        { height: 700, crop: "scale" },
      ],
    };
  },
});

const upload = multer({ storage,
  fileFilter: (req, file, cb)=>{
      const formatsArray = ['image/jpeg', 'image/jpg', 'image/png', 'image/avif', 'image/bmp', 'image/webp' ];

      if (formatsArray.indexOf(file.mimetype) === -1) {
        return cb(httpError(500,"Wrong file format!"));
      }

      cb(null, true);
  }
});

//const upload = multer({ storage });


//----------------------------------------------------------------------------------------------

module.exports = upload;
