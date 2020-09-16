const { admin, db } = require('../util/admin')
const config = require('../util/config');
const { bvnPortalUrl, loginUrl } = require('../util/resource');
const { docApproved } = require('../util/template');
const { sendEmail, sendVerificationCode, confirmVerificationCode } = require('./messaging');
const BusBoy = require('busboy');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Axios = require('axios');

const firebase = require('firebase');

firebase.initializeApp(config);

const { validateLoginData, validateSignUpData } = require('../util/validators');

exports.loginUser = (request, response) => {
    const user = {
        email: request.body.email,
        password: request.body.password
    }
    console.log('requesting login', user)

    const { valid, errors } = validateLoginData(user);
	if (!valid) return response.status(400).json(errors);

    firebase
        .auth()
        .signInWithEmailAndPassword(user.email, user.password)
        .then((data) => {
            console.log(data.user.emailVerified);
            if (data.user.emailVerified){
                console.log('email is verified')
                return data.user.getIdToken();
            }
            return response.status(403).json({ general: 'Email not verified. Check your email to verify'});
        })
        .then((token) => {
            console.log('Login granted.. Token generated', token)
            return response.json({ token });
        })
        .catch((error) => {
            // console.error(error);
            return response.status(403).json({ general: 'Wrong credentials, please try again'});
        })
};

exports.signUpUser = (request, response) => {
    const newUser = {
        firstName: request.body.firstName,
        lastName: request.body.lastName,
        email: request.body.email,
		password: request.body.password,
		confirmPassword: request.body.confirmPassword,
		username: request.body.username
    };

    const { valid, errors } = validateSignUpData(newUser);

	if (!valid) return response.status(400).json(errors);

    let userId;
    db
        .doc(`/users/${newUser.username}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                return response.status(400).json({ username: 'This username is already taken' });
            } else {
                return firebase
                        .auth()
                        .createUserWithEmailAndPassword(
                            newUser.email, 
                            newUser.password
                    );
            }
        })
        .then((data) => {
            userId = data.user.uid;
            console.log(data.user);
            return data.user.sendEmailVerification({
                url: loginUrl
              });
        })
        .then((res) => {
            // console.log(res);
            const userCredentials = {
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                username: newUser.username,
                email: newUser.email,
                bvn: {approved: false},
                kycLevel: 0,
                createdAt: new Date().toISOString(),
                documents: {approved: false},
                userId
            };
            return db
                    .doc(`/users/${newUser.username}`)
                    .set(userCredentials);
        })
        .then(()=>{
            return response.status(201).json({ success: 'Created Successfully' });
        })
        .catch((err) => {
			console.error(err);
			if (err.code === 'auth/email-already-in-use') {
				return response.status(400).json({ email: 'Email already in use' });
			} else {
				return response.status(500).json({ general: 'Something went wrong, please try again' });
			}
		});
}

deleteDocument = (imageName) => {
    const bucket = admin.storage().bucket();
    const path = `${imageName}`
    return bucket.file(path).delete()
    .then(() => {
        return
    })
    .catch((error) => {
        return
    })
}

// Upload passport
exports.uploadPassport = (request, response) => {
    
    const busboy = new BusBoy({ headers: request.headers });
    
	let imageFileName;
	let imageToBeUploaded = {};

	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		if (mimetype !== 'image/png' && mimetype !== 'image/jpeg') {
			return response.json({ error: 'Wrong file type submitted' });
		}
        const imageExtension = filename.split('.')[filename.split('.').length - 1];
        
        imageFileName = `${request.user.username}-passport.${imageExtension}`;
        const filePath = path.join(os.tmpdir(), imageFileName);
		imageToBeUploaded = { filePath, mimetype };
		file.pipe(fs.createWriteStream(filePath));
    });

    deleteDocument(imageFileName);
	busboy.on('finish', () => {
		admin
			.storage()
			.bucket()
			.upload(imageToBeUploaded.filePath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imageToBeUploaded.mimetype
					}
				}
			})
			.then(() => {
				const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
                return db
                        .doc(`/users/${request.user.username}`)
                        .update({
                            "documents.passport": {
                                    documentName: imageFileName,
                                    url: imageUrl
                                }
                            });
			})
			.then(() => {
				return response.json({ success: 'Passport uploaded successfully' });
			})
			.catch((error) => {
				console.error(error);
				return response.status(500).json({ error: error.code });
			});
	});
	busboy.end(request.rawBody);
};

// Upload Utility Bill
exports.uploadUtilityBill = (request, response) => {
    
	const busboy = new BusBoy({ headers: request.headers });

	let imageFileName;
	let imageToBeUploaded = {};

	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		if (mimetype !== 'image/png' && mimetype !== 'image/jpeg') {
			return response.status(400).json({ error: 'Wrong file type submitted' });
		}
		const imageExtension = filename.split('.')[filename.split('.').length - 1];
        imageFileName = `${request.user.username}-utility.${imageExtension}`;
		const filePath = path.join(os.tmpdir(), imageFileName);
		imageToBeUploaded = { filePath, mimetype };
		file.pipe(fs.createWriteStream(filePath));
    });
    deleteDocument(imageFileName);
	busboy.on('finish', () => {
		admin
			.storage()
			.bucket()
			.upload(imageToBeUploaded.filePath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imageToBeUploaded.mimetype
					}
				}
			})
			.then(() => {
				const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
				return db
                .doc(`/users/${request.user.username}`)
                .update({
                    "documents.utility": {
                            documentName: imageFileName,
                            url: imageUrl
                        }
                    })
            })
			.then(() => {
				return response.json({ success: 'Utility bill uploaded successfully' });
			})
			.catch((error) => {
				console.error(error);
				return response.status(500).json({ error: error.code });
			});
    });
    
    busboy.end(request.rawBody);
};

exports.verifyBVN = async (request, response) => {
//expect bvn, dob in request.body
let retriesCount;
await db
        .doc(`/users/${request.user.username}`)
        .get()
        .then((doc) => {
            if (doc.exists) {
                retriesCount = doc.data().bvn.retries ? doc.data().bvn.retries : 0
                if(retriesCount >= 4){
                    return response.json({error: "You've reached your retries limit. Please Contact support"});
                }
            }	
            return;
        })
console.log(request.body);

Axios
    .get(bvnPortalUrl + request.body.bvn)
    .then((res) => {
        console.log(res.data);
        if(!res.data.hasOwnProperty("dob")){
            return response.json({
                error: res.data.error ? res.data.error : "Validation failed"
            })
        }

        if(res.data.dob === request.body.dob){
             return sendVerificationCode(res.data.phoneNumber);
        }
        else{
            return response.json({
                error: "Exact match wasn't found"
            })
        }
    })
    .then((res) => {
        if(res.data.hasOwnProperty('status')){
            if(res.data.status === 'SUCCESS' && res.data.hasOwnProperty('token')){
                console.log('Code delivery successful', res.data);
                db
                    .doc(`/users/${request.user.username}`)
                    .update({
                        "bvn.retries": retriesCount+1
                    })
                return response.status(200).json({
                                success: `OTP sent to your registered phone number. Valid for ${res.data.expires_in/60}mins`,
                                token: res.data.token,
                                retry: `${parseInt(res.data.retry_in)/60}min`
                            });
            }
            else{
                return response.json({
                    error: "OTP delivery failed"
                })
            }
        }
        return response.json({
            error: "Validation failed"
        })
    })
    .catch((err) => {
        // console.error(err);
        return response.json({
            error: err.message
        });
    })
}

exports.validateCode = (request, response) => {
//expect token, code, bvn in request.body
    if (!request.body.hasOwnProperty('token') || request.body.code === "" || request.body.code === null){
        return response.json({
            error: "Please provide received code"
        })
    }

    confirmVerificationCode(request.body.token, request.body.code)
    .then((res) => {
        if(res.data.hasOwnProperty('status')){
            if(res.data.status === 'SUCCESS' && res.data.hasOwnProperty('token')){
                console.log('Code Validated', res.data);
                db
                    .doc(`/users/${request.user.username}`)
                    .update({
                        "bvn.bvnValue": request.body.bvn,
                        "bvn.approved": true,
                        phoneNumber: res.data.phone,
                        kycLevel: 1,
                    })
                    return response.status(200).json({
                        success: "Validation successful, continue to level 2",
                    });
            }
            else if (res.data.status === 'ERROR'){
                switch(res.data.message) {
                    case "ERROR_INVALID_PIN_CODE":
                        return response.json({
                            error: "The provided code is invalid",
                            canRetry: true
                        })
                    case "ERROR_INVALID_SESSION":
                        return response.json({
                            error: "The code validation session has expired. Request new code"
                        });
                    default:
                        return response.json({error: "Code validation failed"});
                    }
            }
        }
        return response.json({
            error: "Validation failed"
        })
    })
    .catch((err) => {
        // console.error(err);
        return response.json({
            error: err.message
        });
    })
}

exports.getUserDetails = (request, response) => {
    let userData = {};
	db
		.doc(`/users/${request.user.username}`)
		.get()
		.then((doc) => {
			if (doc.exists) {
                userData.userCredentials = doc.data();
                return response.json(userData);
            }	
            return;
		})
		.catch((error) => {
			console.error(error);
			return response.status(500).json({ error: error.code });
		});
}

// Mock BVN Fetch Fxn
exports.fetchBvnData = async (request, response) => {
    if (!request.params.num){
        return response.json({ error: "Please provide a BVN" })
    }
    console.log(request.params.num);
    const bvnRef = db.collection("bvndata");
    const snapshot = await bvnRef.where("bvn", "==", request.params.num).limit(1).get()

    if (snapshot.empty) {
        console.log('No matching documents.');
        return response.json({ error: "BVN match not found"});
      }

      snapshot.forEach(doc => {
            console.log(doc.id, '=>', doc.data());
            return response.json({ 
                valid: true,
                dob: doc.data().dob,
                phoneNumber:doc.data().phoneNumber 
            })
        });
}

// Trigger email onUpdate (document approved)
exports.sendApprovalEmail = async (change, context) => {
console.log('here i am')
    // Read the user document
    const user = change.after.data();

    if(user.documents.approved && (user.kycLevel < 2)){
        console.log('yes, document was approved')
        const iniCapName = capFirstLetter(user.firstName)
        console.log(iniCapName)
        let approvalBody = docApproved.replace("[first_name]", iniCapName);
        approvalBody = approvalBody.replace("[login_url]", loginUrl);
        console.log(approvalBody)

        // Email
        const msg = {
            to: user.email,
            from: functions.config().zohomail.email,
            subject: `Approved - Your documents have been approved`,
            body: approvalBody
        };

        await db
            .collection('users').doc(context.params.userId)
            .update({
                "documents.approved": true,
                kycLevel: 2,
            })

        // Send mail
        return console.log(sendEmail(msg));
    }
    return;
}

const capFirstLetter = (name) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

exports.addBvnData = (request, response) => {

    const newBvnData = {
        bvn: request.body.bvn,
        dob: request.body.dob,
        name: request.body.fullName,
        phoneNumber: request.body.phoneNumber,
        createdAt: new Date().toISOString()
    }

    db
        .collection("bvndata")
        .add(newBvnData)
        .then((doc) => {
            const responseBvnData = newBvnData;
            responseBvnData.id = doc.id;
            return response.json(responseBvnData);
        })
        .catch((err) => {
            console.error(err);
            return response.status(500).json({ error: "Bvn data creation failed"});
        })
}
