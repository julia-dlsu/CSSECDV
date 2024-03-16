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

    // LOAD RENEWAL APPLICATIONS
    getRenewalApps: async (req, res)=>{
        const getEAFParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const eaf_command = new GetObjectCommand(getEAFParams);
        const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });
    
        const getGradesParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const grades_command = new GetObjectCommand(getGradesParams);
        const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });
    
        // sample data only, replace when querying db
        // id here is application id NOT user id
        const applications = [
            { id: 1, scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', eaf: eaf_url, grades: grades_url, date: '03/03/2024' },
            { id: 2, scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', eaf: eaf_url, grades: grades_url, date: '03/03/2024' },
            { id: 3, scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', eaf: eaf_url, grades: grades_url, date: '03/03/2024' }
        ]
    
        return res.render('adminRenew', { applications });
    },

    // APPROVE RENEWAL APPLICATION
    approveRenewApp: async (req, res)=>{
        console.log(req.body);
        console.log(req.file);
        return res.redirect('/admin/renew-scholarship/approved');
    },

    // REJECT RENEWAL APPLICATION
    rejectRenewApp: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/admin/renew-scholarship/rejected');
    },

    // LOAD APPROVED RENEWAL APPLICATIONS
    getApprovedRenew: async (req, res)=>{
        const getEAFParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const eaf_command = new GetObjectCommand(getEAFParams);
        const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });
    
        const getGradesParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const grades_command = new GetObjectCommand(getGradesParams);
        const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });
    
        const getApproveParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const approve_command = new GetObjectCommand(getApproveParams);
        const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
    
        // sample data only, replace when querying db
        const applications = [
            { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url, approved: approve_url },
            { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url, approved: approve_url },
            { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url, approved: approve_url }
        ]
    
        return res.render('approvedRenewals', { applications });
    },

    // LOAD REJECTED RENEWAL APPLICATIONS
    getRejectedRenew: async (req, res)=>{
        const getEAFParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const eaf_command = new GetObjectCommand(getEAFParams);
        const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });
    
        const getGradesParams = {
            Bucket: bucketName,
            Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
        }
        const grades_command = new GetObjectCommand(getGradesParams);
        const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });
    
        // sample data only, replace when querying db
        const applications = [
            { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url },
            { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url },
            { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url }
        ]
    
        return res.render('rejectedRenewals', { applications });
    }
    
};

module.exports = controller;