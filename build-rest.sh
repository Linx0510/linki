#!/bin/bash

# ROUTES
cat > routes/index.js << 'R1'
const express=require('express');const router=express.Router();
router.get('/',(req,res)=>res.render('landing',{title:'LUDO'}));
module.exports=router;
R1

cat > routes/auth.js << 'R2'
const express=require('express');const router=express.Router();const{User}=require('../models');
router.get('/login',(req,res)=>res.render('auth/login',{title:'Вход',error:null}));
router.post('/login',async(req,res)=>{try{const{email,password}=req.body;const u=await User.findOne({where:{email}});if(!u||!(await u.comparePassword(password)))return res.render('auth/login',{title:'Вход',error:'Неверные данные'});req.session.user={id:u.id,username:u.username,role:u.role,level:u.level,xp:u.xp};res.redirect('/user/dashboard');}catch(e){res.render('auth/login',{title:'Вход',error:'Ошибка'});}});
router.get('/register',(req,res)=>res.render('auth/register',{title:'Регистрация',error:null}));
router.post('/register',async(req,res)=>{try{const{username,email,password}=req.body;await User.create({username,email,password});res.redirect('/auth/login');}catch(e){res.render('auth/register',{title:'Регистрация',error:'Ошибка'});}});
router.post('/logout',(req,res)=>{req.session.destroy();res.redirect('/');});
module.exports=router;
R2

cat > routes/user.js << 'R3'
const express=require('express');const router=express.Router();const{User,UserQuest,Quest,TaskCompletion,Achievement,UserAchievement}=require('../models');
const auth=(req,res,next)=>req.session.user?next():res.redirect('/auth/login');
router.get('/dashboard',auth,async(req,res)=>{try{const uq=await UserQuest.findAll({where:{userId:req.session.user.id,status:'active'},include:[{model:Quest,as:'quest'}],limit:10});const stats={active:uq.length,xp:req.session.user.xp,level:req.session.user.level};res.render('user/dashboard',{title:'Дашборд',userQuests:uq,stats});}catch(e){res.render('user/dashboard',{title:'Дашборд',userQuests:[],stats:{active:0,xp:0,level:1}});}});
router.get('/profile',auth,async(req,res)=>{try{const u=await User.findByPk(req.session.user.id);res.render('user/profile',{title:'Профиль',profile:u});}catch(e){res.redirect('/user/dashboard');}});
router.get('/achievements',auth,async(req,res)=>{try{const ua=await UserAchievement.findAll({where:{userId:req.session.user.id},include:[{model:Achievement,as:'achievement'}]});res.render('user/achievements',{title:'Достижения',achievements:ua});}catch(e){res.render('user/achievements',{title:'Достижения',achievements:[]});}});
module.exports=router;
R3

cat > routes/quests.js << 'R4'
const express=require('express');const router=express.Router();const{Quest,User,UserQuest,Task,Review}=require('../models');
router.get('/',async(req,res)=>{try{const q=await Quest.findAll({where:{isPublic:true},include:[{model:User,as:'creator'}],limit:20});res.render('quests/browse',{title:'Квесты',quests:q});}catch(e){res.render('quests/browse',{title:'Квесты',quests:[]});}});
router.get('/:id',async(req,res)=>{try{const q=await Quest.findByPk(req.params.id,{include:[{model:User,as:'creator'},{model:Task,as:'tasks'},{model:Review,as:'reviews',include:[{model:User,as:'reviewer'}]}]});if(!q)return res.redirect('/quests');res.render('quests/detail',{title:q.title,quest:q});}catch(e){res.redirect('/quests');}});
router.post('/:id/enroll',async(req,res)=>{if(!req.session.user)return res.redirect('/auth/login');try{await UserQuest.create({userId:req.session.user.id,questId:req.params.id});const q=await Quest.findByPk(req.params.id);q.totalEnrollments+=1;await q.save();res.redirect('/user/dashboard');}catch(e){res.redirect('/quests');}});
router.post('/:id/complete-task',async(req,res)=>{if(!req.session.user)return res.json({success:false});try{const{taskId,userQuestId}=req.body;const tc=await TaskCompletion.create({taskId,userQuestId,xpEarned:10});const uq=await UserQuest.findByPk(userQuestId);uq.progress+=10;if(uq.progress>=100){uq.status='completed';}await uq.save();const u=await User.findByPk(req.session.user.id);await u.addXP(10);res.json({success:true});}catch(e){res.json({success:false});}});
module.exports=router;
R4

cat > routes/expert.js << 'R5'
const express=require('express');const router=express.Router();const{Expert,User,Quest}=require('../models');
router.get('/',async(req,res)=>{try{const e=await Expert.findAll({where:{verificationStatus:'verified'},include:[{model:User,as:'user'}]});res.render('expert/browse',{title:'Эксперты',experts:e});}catch(e){res.render('expert/browse',{title:'Эксперты',experts:[]});}});
router.get('/apply',(req,res)=>res.render('expert/apply',{title:'Стать экспертом'}));
router.post('/apply',async(req,res)=>{if(!req.session.user)return res.redirect('/auth/login');try{const{specialization,bio}=req.body;await Expert.create({userId:req.session.user.id,specialization,bio});res.redirect('/user/profile');}catch(e){res.redirect('/expert/apply');}});
module.exports=router;
R5

cat > routes/admin.js << 'R6'
const express=require('express');const router=express.Router();const{User,Quest,Expert}=require('../models');
const isAdmin=(req,res,next)=>(req.session.user&&req.session.user.role==='admin')?next():res.redirect('/');
router.get('/',isAdmin,async(req,res)=>{try{const stats={users:await User.count(),quests:await Quest.count(),experts:await Expert.count()};res.render('admin/dashboard',{title:'Админ',stats});}catch(e){res.render('admin/dashboard',{title:'Админ',stats:{users:0,quests:0,experts:0}});}});
module.exports=router;
R6

cat > routes/community.js << 'R7'
const express=require('express');const router=express.Router();const{User,UserQuest}=require('../models');
router.get('/leaderboard',async(req,res)=>{try{const u=await User.findAll({order:[['xp','DESC']],limit:50});res.render('community/leaderboard',{title:'Рейтинг',users:u});}catch(e){res.render('community/leaderboard',{title:'Рейтинг',users:[]});}});
module.exports=router;
R7

cat > routes/api.js << 'R8'
const express=require('express');const router=express.Router();const{User,Notification}=require('../models');
router.get('/notifications',async(req,res)=>{if(!req.session.user)return res.json([]);try{const n=await Notification.findAll({where:{userId:req.session.user.id},order:[['createdAt','DESC']],limit:10});res.json(n);}catch(e){res.json([]);}});
router.post('/notifications/:id/read',async(req,res)=>{try{const n=await Notification.findByPk(req.params.id);n.isRead=true;await n.save();res.json({success:true});}catch(e){res.json({success:false});}});
module.exports=router;
R8

echo "✅ Routes created"
