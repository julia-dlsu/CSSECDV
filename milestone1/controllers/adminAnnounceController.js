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
        try{
<<<<<<< Updated upstream
            posts = {}
=======
            const posts = []
>>>>>>> Stashed changes
            const post1 = await pool.query(
                `SELECT * FROM admin_announcement WHERE deleted = False;`
            ); 

<<<<<<< Updated upstream
            if (post1.rows.length > 0){
                // Remove time from date format
                for (let day = 0; day < post1.rows.length; day+=1){
                    console.log(post1.rows[day].dateposted )
                    date = post1.rows[day].dateposted 
                    removedTime = date.toISOString().split('T')[0];
                    post1.rows[day].dateposted = removedTime
                }
            }

            posts = post1.rows;
=======
            for (let x = 0; x < post1.rows.length; x++){

                date = post1.rows[x].dateposted 
                removedTime = date.toISOString().split('T')[0];
                post1.rows[x].dateposted = removedTime

                
                posts.push ({
                    id: post1.rows[x].id,
                    date: post1.rows[x].dateposted,
                    admin: post1.rows[x].posted_by,
                    title: post1.rows[x].title,
                    announcement: post1.rows[x].announcement
                })

            }
>>>>>>> Stashed changes

            const data = {
                user: req.user.username,
                posts
            } 
<<<<<<< Updated upstream
    
        
            return res.render('adminDashboard', data);
=======

            return res.render('adminDashboard', data);
            
>>>>>>> Stashed changes
        } catch (err) {
            console.error('Error:', err);
            res.status(500).send('Internal Server Error');
        }
    },

    // LOAD ADMIN OWN ANNOUNCEMENTS
    getAdminAnnouncements: async (req, res)=>{
        try{
<<<<<<< Updated upstream
            posts = {}
=======
            const posts = []
>>>>>>> Stashed changes
            const post1 = await pool.query(
                `SELECT * FROM admin_announcement WHERE deleted = False;`
            ); 

<<<<<<< Updated upstream
            if (post1.rows.length > 0){
                // Remove time from date format
                for (let day = 0; day < post1.rows.length; day+=1){
                    console.log(post1.rows[day].dateposted )
                    date = post1.rows[day].dateposted 
                    removedTime = date.toISOString().split('T')[0];
                    post1.rows[day].dateposted = removedTime
                }
            }

            posts = post1.rows;
            
=======
            for (let x = 0; x < post1.rows.length; x++){

                date = post1.rows[x].dateposted 
                removedTime = date.toISOString().split('T')[0];
                post1.rows[x].dateposted = removedTime

                posts.push ({
                    id: post1.rows[x].id,
                    date: post1.rows[x].dateposted,
                    admin: post1.rows[x].posted_by,
                    title: post1.rows[x].title,
                    announcement: post1.rows[x].announcement
                })

            }

>>>>>>> Stashed changes
            const data = {
                user: req.user.username,
                posts
            } 

            return res.render('adminAnnouncements', data);
<<<<<<< Updated upstream

=======
            
>>>>>>> Stashed changes
        } catch (err) {
            console.error('Error:', err);
            res.status(500).send('Internal Server Error');
        }
    },

    // CREATE ANNOUNCEMENT
    createAnnouncement: async (req, res)=>{
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1; 
        const year = today.getFullYear();
        date = month +"-"+ day +"-"+ year 
<<<<<<< Updated upstream
=======

>>>>>>> Stashed changes
        title = req.body.title
        admin = req.user.username
        announcement = req.body.announcement
        user = req.user.username
        let errors = []

        const titleregex = /^[a-zA-Z0-9.,!?&%#$@:;*\-+=\s]{1,64}$/;;
        if (!(titleregex.test(title))){
            errors.push({ message: "Invalid title input." });
        }

        const announcementregex = /^[a-zA-Z0-9.,!?&%#$@:;*\-+=\s]{1,500}$/;;
        if (!(announcementregex.test(announcement))){
            errors.push({ message: "Invalid text input." });
        }

        if (errors.length > 0){
            res.render('adminDashboard', { errors });
<<<<<<< Updated upstream
            console.log("Errored")
        }

=======
        }
        
>>>>>>> Stashed changes
        else{
            errors = ""
            try {
                pool.query(
<<<<<<< Updated upstream
                    `INSERT INTO admin_announcement (datePosted, posted_by, title, announcement)
=======
                    `INSERT INTO admin_announcement (dateposted, posted_by, title, announcement)
>>>>>>> Stashed changes
                    VALUES ($1,$2,$3,$4);`, [date, admin, title, announcement],(err, results)=>{
                        if (err){
                            console.error('Error:', err);
                            res.status(500).send('Internal Server Error');
                        }
                        else{
                        req.flash('success_msg', "Announcement Added");
                        return res.redirect('/admin/dashboard');
                        }
                    }
                )
            } catch (err) {
                console.error('Error:', err);
                res.status(500).send('Internal Server Error');
            }
        }
    },

    // DELETE ANNOUNCEMENT
    deleteAnnouncement: async (req, res)=>{

        try {
            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth() + 1; 
            const year = today.getFullYear();
            date = month +"-"+ day +"-"+ year 

<<<<<<< Updated upstream
            id = req.body['ann-id']
=======
            id = req.body.annId;
>>>>>>> Stashed changes
            pool.query(
                `UPDATE admin_announcement
                 SET deleted = True, dateDeleted = $1
                 WHERE id = $2;`, [date, id],(err, results)=>{
                    if (err){
<<<<<<< Updated upstream
                        console.error('Error:', error);
=======
                        console.error('Error:', err);
>>>>>>> Stashed changes
                        res.status(500).send('Internal Server Error');
                    }
                    else{
                    req.flash('success_msg', "Announcement Deleted");
                    return res.redirect('/admin/dashboard');
                    }
                }
            )
        } catch (err) {
            console.error('Error:', err);
            res.status(500).send('Internal Server Error');
        }

    
    }
    
};

module.exports = controller;