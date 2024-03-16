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

    // LOAD THESIS APPLICATIONS
    getThesisApps: async (req, res)=>{
        const getAFParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const af_command = new GetObjectCommand(getAFParams);
        const af_url = await getSignedUrl(s3, af_command, { expiresIn: 3600 });
    
        const getApproveParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const approve_command = new GetObjectCommand(getApproveParams);
        const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
    
        // sample data only, replace when querying db
        // id here is for application NOT user
        const applications = [
            { id: 1, af: af_url, approved: approve_url, date: '03/03/2024', status: 'Approved' },
            { id: 2, af: af_url, approved: approve_url, date: '03/04/2024', status: 'Rejected' },
            { id: 3, af: af_url, approved: approve_url, date: '03/05/2024', status: 'Pending' }
        ]
    
        return res.render('userThesis', { applications });
    },

    // DELETE PENDING THESIS APPLICATION
    deleteThesisApp: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/users/thesis-budget');
    },

    // APPLY FOR THESIS
    applyThesis: async (req, res)=>{
        console.log(req.body);
        console.log(req.file);
        return res.redirect('/users/thesis-budget');
    }
};

module.exports = controller;