const nodemailer = require('nodemailer');
const Axios = require('axios');
const config = require('../util/config');
const functions = require('firebase-functions');

// api.ringcaptcha.com
const APP_KEY= functions.config().ringcaptcha.app_key; 
const API_Key= functions.config().ringcaptcha.api_key;

// zohomail.com
const email= functions.config().zohomail.email; 
const password= functions.config().zohomail.password;

var transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465,
    auth: {
      user: email, 
      pass: password
    }
  });

  
exports.sendVerificationCode = (phoneNumber) => {
  if(phoneNumber.length === 11 && phoneNumber.charAt(0) === "0"){
    phoneNumber = "234" + phoneNumber.slice(1)
  }
  console.log('about to send code to ', phoneNumber)
  return Axios
      .post(`https://api.ringcaptcha.com/${APP_KEY}/code/sms`, null, {
          params: {
              phone: phoneNumber,
              api_key: API_Key
          }},{ headers: {'content-type': 'application/x-www-form-urlencoded'}})
}

exports.confirmVerificationCode = (token, code) => {
  
  return Axios
      .post(`https://api.ringcaptcha.com/${APP_KEY}/verify`, null, {
          params: {
            token: token,
              api_key: API_Key,
              code: code
          }},{ headers: {'content-type': 'application/x-www-form-urlencoded'}})
}

 exports.sendEmail = (params) => {

    const mailOptions = {
        from: email, //Sender's email
        to: params.to, //Recipient's email
        subject: params.subject, //Email subject
        html: params.body //Email content in HTML
    };

    return transporter.sendMail(mailOptions, (err, info) => {
        if(err){
            return response.send(err.toString());
        }
        return response.send('Email sent successfully');
    });
 } 