const { pool } = require("../models/dbConfig");
const express = require('express')
const bcrypt = require('bcrypt');
const flash = require('express-flash');
const crypto = require('crypto');
const sharp = require('sharp');
const nodemailer = require('nodemailer'); 

const app = express();

const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

require("dotenv").config();

const bucketName = process.env.AWS_BUCKET_NAME
const bucketRegion = process.env.AWS_BUCKET_REGION
const accessKeyId = process.env.AWS_ACCESS_KEY
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

const s3 =  new S3Client({
    region: bucketRegion,
    credentials: {
        accessKeyId,
        secretAccessKey
    }
});

// MIDDLESWARES: configuration for handling API endpoint data
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

// ======= METHODS ======= //
const controller = {

    // LOAD SCHOLAR ACCOUNTS
    getScholarAccs: async (req, res)=>{
        // sample data only, replace when querying db
        const people = [
            { id: 1, scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University' },
            { id: 2, scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University' },
            { id: 3, scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines' }
        ]
    
        return res.render('scholarAccs', { people });
    },

    // LOAD SCHOLAR PROFILE
    getScholarProfile: async (req, res)=>{
        const getObjectParams = {
            Bucket: bucketName,
            Key: req.user.profilepic, // file name
        }
        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
        // sample data only, replace when querying db
        const person = { 
            userpic: url, 
            scholar: 'Julia de Veyra', 
            email: 'amorbdv@gmail.com', 
            type: 'Merit Scholar', 
            school: 'De La Salle University', 
            degree: 'BS Computer Science', 
            accName: 'Julianne Amor B de Veyra', 
            accNum: '1234567890', 
            verified: 'True' 
        };
    
        return res.render('scholarProfile', person);
    },

    // VERIFY SCHOLAR ACCOUNT
    verifyScholarAcc: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/admin/scholars');
    }
    
};

module.exports = controller;