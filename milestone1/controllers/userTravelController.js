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

    // LOAD TRAVEL APPLICATIONS
    getTravelApps: async (req, res)=>{
        const getLOIParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const loi_command = new GetObjectCommand(getLOIParams);
        const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });
    
        const getDOUParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const dou_command = new GetObjectCommand(getDOUParams);
        const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });
    
        const getITRParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const itr_command = new GetObjectCommand(getITRParams);
        const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });
    
        const getApproveParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const approve_command = new GetObjectCommand(getApproveParams);
        const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
    
        // sample data only, replace when querying db
        // id here is for application NOT user
        const applications = [
            { id: 1, loi: loi_url, dou: dou_url, itr: itr_url, approved: approve_url, date: '03/03/2024', status: 'Approved' },
            { id: 2, loi: loi_url, dou: dou_url, itr: itr_url, approved: null, date: '03/04/2024', status: 'Rejected' },
            { id: 3, loi: loi_url, dou: dou_url, itr: itr_url, approved: null, date: '03/05/2024', status: 'Pending' }
        ]
    
        return res.render('userTravel', { applications });
    },

    // DELETE PENDING TRAVEL APPLICATION
    deleteTravelApp: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/users/travel-abroad');
    },

    // APPLY FOR TRAVEL
    applyTravel: async (req, res)=>{
        console.log(req.body);
        console.log(req.files);
        return res.redirect('/users/travel-abroad');
    }
};

module.exports = controller;