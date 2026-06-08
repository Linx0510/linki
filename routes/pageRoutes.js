const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../config/database');
const pageController = require('../controllers/pageController');
const workController = require('../controllers/workController');
const serviceController = require('../controllers/serviceController');
const feedbackController = require('../controllers/feedbackController');
const { requireAuth, csrfProtect } = require('../middleware/authMiddleware');
const MAX_WORK_IMAGES = 10;

const worksUploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(worksUploadDir)) {
    fs.mkdirSync(worksUploadDir, { recursive: true });
}

const workStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, worksUploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safeExt = ext || '.jpg';
        cb(null, `work-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    },
});

const workUpload = multer({
    storage: workStorage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: MAX_WORK_IMAGES,
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }
        return cb(new Error('Разрешены только изображения'));
    },
});

const serviceStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, worksUploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const safeExt = ext || '.jpg';
        cb(null, `service-cover-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    },
});

const serviceUpload = multer({
    storage: serviceStorage,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }
        return cb(new Error('Разрешены только изображения'));
    },
});



router.get('/', pageController.getIndexPage);
router.get('/lenta', pageController.getLentaPage);
router.get('/birzha', requireAuth, pageController.getBirzhaPage);
router.post('/feedback', csrfProtect, feedbackController.createFeedback);

router.get('/legal/offer', pageController.getOfferPage);
router.get('/legal/privacy', pageController.getPrivacyPolicyPage);
router.get('/legal/personalDataConsent', pageController.getPersonalDataConsentPage);
router.get('/legal/marketingConsent', pageController.getMarketingConsentPage);


router.get('/works/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const searchParams = query ? `?q=${encodeURIComponent(query)}` : '';
    res.redirect(`/lenta${searchParams}`);
});


router.get('/profile', pageController.getProfilePage);
router.get('/profile/:id', pageController.getProfilePage);
router.get('/users/:id/review', requireAuth, pageController.getReviewPage);
router.get('/portfolio', requireAuth, pageController.getPortfolioPage);
router.get('/portfolio/:id', requireAuth, pageController.getPortfolioPage);
router.get('/subscriptions', requireAuth, pageController.getSubscriptionsPage);
router.get('/deals', requireAuth, pageController.getDealsPage);
router.get('/orders', requireAuth, pageController.getOrdersPage);
router.get('/orders/create', requireAuth, pageController.getCreateOrderPage);
router.get('/orders/:id', requireAuth, pageController.getOrderPage);
router.get('/services', requireAuth, pageController.getServicesPage);
router.get('/services/create', requireAuth, pageController.getCreateServicePage);
router.get('/services/:id', pageController.getServicePage);


router.get('/works/create', requireAuth, pageController.getCreateWorkPage);
router.get('/works/:workId/edit', requireAuth, pageController.getEditWorkPage);
router.get('/works/:id', pageController.getWorkPage);
router.post('/works/create', requireAuth, workUpload.array('workImages', MAX_WORK_IMAGES), csrfProtect, workController.createWork);
router.post('/works/:workId/edit', requireAuth, workUpload.array('workImages', MAX_WORK_IMAGES), csrfProtect, workController.updateWork);
router.post('/works/:workId/report', requireAuth, csrfProtect, workController.reportWork);
router.post('/reports/:targetType/:targetId', requireAuth, csrfProtect, workController.reportContent);
router.post('/works/:workId/delete', requireAuth, csrfProtect, workController.deleteWork);
router.post('/services/create', requireAuth, serviceUpload.single('cover'), csrfProtect, serviceController.createService);


router.get('/chat', requireAuth, (req, res) => {
    res.render('chat', {
        currentUser: req.session.user,
        csrfToken: req.session?.csrfToken || '',
    });
});
router.get('/messages', requireAuth, (req, res) => {
    res.redirect('/chat');
});


router.get('/deals/propose', requireAuth, async (req, res) => {
    const targetType = req.query.targetType;
    const targetId = parseInt(req.query.targetId, 10);
    if (!['service', 'order'].includes(targetType) || !targetId) {
        return res.status(400).send('Неверные параметры');
    }
    try {
        let target = null;
        if (targetType === 'service') {
            const result = await db.query(
                `SELECT s.*, u.id as author_id, u.first_name, u.last_name, u.avatar
                 FROM services s
                 LEFT JOIN users u ON u.id = COALESCE(s.provider_id, s.user_id)
                 WHERE s.id = $1`,
                [targetId]
            );
            target = result.rows[0] || null;
        } else {
            const result = await db.query(
                `SELECT o.*, u.id as author_id, u.first_name, u.last_name, u.avatar
                 FROM orders o
                 LEFT JOIN users u ON u.id = o.customer_id
                 WHERE o.id = $1`,
                [targetId]
            );
            target = result.rows[0] || null;
        }
        if (!target) {
            return res.status(404).send('Объект не найден');
        }
        res.render('propose-deal', {
            targetType,
            targetId,
            target,
            csrfToken: req.session?.csrfToken || '',
        });
    } catch (err) {
        console.error('Propose deal page error:', err);
        res.status(500).send('Ошибка загрузки');
    }
});


router.get('/propose-deal', requireAuth, async (req, res) => {
    console.log('>>> HIT /propose-deal', req.query);
    const recipientId = parseInt(req.query.recipient_id, 10);
    if (!recipientId) {
        return res.status(400).send('Укажите получателя');
    }
    try {
        const userResult = await db.query(
            `SELECT id, first_name, last_name, avatar, bio FROM users WHERE id = $1`,
            [recipientId]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).send('Пользователь не найден');
        }
        const recipient = userResult.rows[0];
        res.render('propose-deal', {
            targetType: null,
            targetId: null,
            target: null,
            recipient,
            csrfToken: req.session?.csrfToken || '',
        });
    } catch (err) {
        console.error('Propose deal page error:', err);
        res.status(500).send('Ошибка загрузки');
    }
});

router.get('/deals/proposals/:id', requireAuth, pageController.getDealProposalPage);
router.get('/deals/:id', requireAuth, pageController.getOrderPage);


router.get('/balance', requireAuth, pageController.getBalancePage);
router.get('/withdraw', requireAuth, pageController.getWithdrawPage);
router.get('/settings', requireAuth, (req, res) => {
    res.render('settings');
});
router.get('/notifications', requireAuth, pageController.getNotificationsPage);
router.post('/notifications/delete-all', requireAuth, csrfProtect, async (req, res) => {
    try {
        await db.query('DELETE FROM notifications WHERE user_id = $1', [req.session.user.id]);
        res.redirect('/notifications');
    } catch (error) {
        console.error('Delete notifications page error:', error);
        res.status(500).send('Ошибка при удалении уведомлений');
    }
});
router.get('/account/settings', requireAuth, (req, res) => {
    res.redirect('/settings');
});

module.exports = router;
