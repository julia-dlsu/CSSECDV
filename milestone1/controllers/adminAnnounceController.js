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

    // LOAD ADMIN DASHBOARD
    getAdminDashboard: async (req, res)=>{
        const posts = [
            { date: '03/03/2023', admin: 'admin1', title: 'Test1', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { date: '03/03/2023', admin: 'admin2', title: 'Test2', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { date: '03/03/2023', admin: 'admin3', title: 'Test3', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' }
        ]
    
        const data = {
            user: req.user.username,
            posts
        }
    
        return res.render('adminDashboard', data);
    },

    // LOAD ADMIN OWN ANNOUNCEMENTS
    getAdminAnnouncements: async (req, res)=>{
        const posts = [
            { id: 1, date: '03/03/2023', admin: 'admin1', title: 'Test1', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { id: 2, date: '03/03/2023', admin: 'admin2', title: 'Test2', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { id: 3, date: '03/03/2023', admin: 'admin3', title: 'Test3', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' }
        ]
    
        const data = {
            user: req.user.username,
            posts
        }
    
        return res.render('adminAnnouncements', data);
    },

    // CREATE ANNOUNCEMENT
    createAnnouncement: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/admin/dashboard');
    },

    // DELETE ANNOUNCEMENT
    deleteAnnouncement: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/admin/announcements');
    }
    
};

module.exports = controller;