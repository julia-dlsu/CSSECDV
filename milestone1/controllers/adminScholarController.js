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
const { Console } = require("console");

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

        try{
            let list1 = []
            // get email of unverified users
            const emails = await pool.query(
                `SELECT email FROM users WHERE verified = False`);   
            
            // use those emails to get their info
            for (let x = 0; x < emails.rows.length; x+=1){
                email1 = emails.rows[x].email;

                const people1 = await pool.query(
                    `SELECT * FROM users_additional_info WHERE email = $1;`, [email1]);
                list1.push(people1.rows);
            }

            // formatting
            let people = [];
            for (let x = 0; x < list1.length; x++) {
                people.push(list1[x][0]);
            }
        
            console.log(people);
            
            return res.render('scholarAccs', { people });  
        
        } catch (err) {
            res.status(500).send('Internal Server Error');
        }
    
        
    },

    // LOAD SCHOLAR PROFILE
    getScholarProfile: async (req, res)=>{
    
        try{
            let email1 = req.params.email;
            const acc = await pool.query(
                `SELECT * FROM users WHERE email = $1;`, [email1]);   
            
            console.log(acc.rows);
            const person1 = await pool.query(
                `SELECT * FROM users_additional_info WHERE email = $1;`, [email1]);
             
            const getObjectParams = {
                Bucket: bucketName,
                Key: acc.rows[0].profilepic, // file name
            }
            const command = new GetObjectCommand(getObjectParams);
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

            let person = {
                account_name: person1.rows[0].account_name,
                account_num: person1.rows[0].account_num,
                mail: person1.rows[0].email,
                scholar_type: person1.rows[0].scholar_type,
                university: person1.rows[0].university, 
                degree: person1.rows[0].degree,
                verified: acc.rows[0].verified,
                userpic: url
            }

            return res.render('scholarProfile', {person});

        } catch (err) {
            res.status(500).send('Internal Server Error');
        }

    },

    // VERIFY SCHOLAR ACCOUNT
    verifyScholarAcc: async (req, res)=>{
        try{
        email = req.body.email;

        pool.query(
            `UPDATE users
             SET verified = True
             WHERE email = $1;`,[email],(err, results)=>{
                if (err){
                    console.error('Error:', err);
                    res.status(500).send('Internal Server Error');
                }
                else{
                req.flash('success_msg', "User Verified");
                return res.redirect('/admin/scholars');
                }
            }
        )

        } catch (err){
            res.status(500).send('Internal Server Error');
        }
    }
    
};

module.exports = controller;