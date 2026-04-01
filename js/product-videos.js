// ============================================
// TIKTOK-STYLE PRODUCT VIDEO FEED - COMPLETE
// With unmute button and all features
// ============================================

console.log('📱 Product Video Feed loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const VideoFeed = {
    currentUser: null,
    videos: [],
    currentPage: 1,
    hasMore: true,
    isLoading: false,
    currentVideoIndex: 0,
    videoElements: [],
    likes: new Set(),
    currentCommentVideoId: null,
    
    async init() {
        try {
            await this.checkAuth();
            await this.loadVideos();
            this.setupIntersectionObserver();
            this.setupEventListeners();
            
            console.log('✅ Video feed ready');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showToast('Error loading feed', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
        } catch (error) {
            console.error('Auth check error:', error);
        }
    },
    
    async loadVideos(reset = false) {
        if (this.isLoading || !this.hasMore) return;
        
        this.isLoading = true;
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            const container = document.getElementById('feedContainer');
            if (container) container.innerHTML = '';
            this.videoElements = [];
        }
        
        try {
            const from = (this.currentPage - 1) * 10;
            const to = from + 9;
            
            const { data, error } = await sb
                .from('product_videos')
                .select(`
                    *,
                    supplier:suppliers!product_videos_supplier_id_fkey (
                        id,
                        business_name,
                        profile:profiles!suppliers_profile_id_fkey (
                            avatar_url,
                            full_name
                        )
                    ),
                    product:ads!product_videos_product_id_fkey (
                        id,
                        title,
                        price,
                        currency
                    )
                `)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .range(from, to);
            
            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }
            
            if (this.currentUser) {
                await this.loadUserLikes();
            }
            
            if (data) {
                data.forEach(video => {
                    video.liked = this.likes.has(video.id);
                });
            }
            
            if (reset) {
                this.videos = data || [];
            } else {
                this.videos = [...this.videos, ...(data || [])];
            }
            
            this.hasMore = (data || []).length === 10;
            this.renderVideos(reset);
            
            const loadingEl = document.getElementById('loadingState');
            if (loadingEl) loadingEl.style.display = 'none';
            
        } catch (error) {
            console.error('Error loading videos:', error);
            this.showToast('Error loading videos: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    async loadUserLikes() {
        try {
            const { data, error } = await sb
                .from('video_likes')
                .select('video_id')
                .eq('user_id', this.currentUser.id);
            
            if (error) throw error;
            
            this.likes = new Set(data.map(like => like.video_id));
        } catch (error) {
            console.error('Error loading likes:', error);
        }
    },
    
    renderVideos(reset) {
        const container = document.getElementById('feedContainer');
        if (!container) return;
        
        if (reset) {
            container.innerHTML = '';
            this.videoElements = [];
        }
        
        const startIndex = reset ? 0 : this.videoElements.length;
        
        this.videos.slice(startIndex).forEach((video, index) => {
            const videoElement = this.createVideoElement(video);
            container.appendChild(videoElement);
            this.videoElements.push(videoElement);
        });
        
        if (reset) {
            this.setupIntersectionObserver();
        }
    },
    
    createVideoElement(video) {
        const div = document.createElement('div');
        div.className = 'video-item';
        div.dataset.videoId = video.id;
        
        const supplierName = video.supplier?.business_name || 'Supplier';
        const supplierInitial = supplierName.charAt(0).toUpperCase();
        const avatarUrl = video.supplier?.profile?.avatar_url;
        const productTitle = video.product?.title || 'Product';
        
        div.innerHTML = `
            <div class="video-wrapper">
                <video loop playsinline muted preload="metadata" poster="${video.thumbnail_url || ''}">
                    <source src="${video.video_url}" type="video/mp4">
                </video>
                
                <div class="video-overlay"></div>
                
                <div class="play-indicator">
                    <i class="fas fa-play"></i>
                </div>
                
                <button class="unmute-btn" onclick="VideoFeed.toggleMute(this, ${video.id})">
                    <i class="fas fa-volume-mute"></i>
                </button>
                
                <div class="sound-wave hide">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                
                <div class="video-info">
                    <div class="supplier-info" onclick="VideoFeed.viewSupplier('${video.supplier?.id}')">
                        ${avatarUrl 
                            ? `<img src="${avatarUrl}" class="supplier-avatar">`
                            : `<div class="supplier-avatar">${supplierInitial}</div>`
                        }
                        <span class="supplier-name">${this.escapeHtml(supplierName)}</span>
                    </div>
                    
                    <div class="product-name">${this.escapeHtml(productTitle)}</div>
                    
                    <div class="video-caption">${this.escapeHtml(video.caption || '')}</div>
                    
                    <button class="inquiry-btn" onclick="VideoFeed.sendInquiry(${video.id}, '${video.supplier?.id}', ${video.product?.id})">
                        <i class="fas fa-comment-dots"></i>
                        Send Inquiry
                    </button>
                </div>
                
                <div class="action-buttons">
                    <div class="action-btn ${video.liked ? 'liked' : ''}" onclick="VideoFeed.toggleLike(${video.id})">
                        <i class="fas fa-heart"></i>
                        <span class="like-count">${video.likes || 0}</span>
                    </div>
                    
                    <div class="action-btn" onclick="VideoFeed.openComments(${video.id})">
                        <i class="fas fa-comment"></i>
                        <span>${video.comments || 0}</span>
                    </div>
                    
                    <div class="action-btn" onclick="VideoFeed.shareVideo(${video.id})">
                        <i class="fas fa-share"></i>
                    </div>
                </div>
            </div>
        `;
        
        return div;
    },
    
    toggleMute(button, videoId) {
        const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
        if (!videoElement) return;
        
        const video = videoElement.querySelector('video');
        if (!video) return;
        
        const soundWave = videoElement.querySelector('.sound-wave');
        
        video.muted = !video.muted;
        
        const icon = button.querySelector('i');
        if (video.muted) {
            icon.className = 'fas fa-volume-mute';
            if (soundWave) soundWave.classList.add('hide');
        } else {
            icon.className = 'fas fa-volume-up';
            if (soundWave) soundWave.classList.remove('hide');
        }
        
        if (!video.muted && video.paused) {
            video.play().catch(e => console.log('Play failed:', e));
        }
        
        if (!video.muted) {
            this.showToast('Sound on', 'info');
        }
    },
    
    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.7
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = this.videoElements.indexOf(entry.target);
                    if (index !== -1) {
                        this.playVideo(index);
                        
                        if (index >= this.videoElements.length - 3) {
                            this.loadMoreVideos();
                        }
                    }
                } else {
                    const video = entry.target.querySelector('video');
                    if (video) {
                        video.pause();
                    }
                }
            });
        }, options);
        
        this.videoElements.forEach(video => observer.observe(video));
    },
    
    playVideo(index) {
        this.videoElements.forEach((el, i) => {
            const video = el.querySelector('video');
            if (video && i !== index) {
                video.pause();
            }
        });
        
        const currentElement = this.videoElements[index];
        if (currentElement) {
            const video = currentElement.querySelector('video');
            if (video) {
                video.muted = true;
                
                const playPromise = video.play();
                
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            console.log('Video playing at index:', index);
                            this.currentVideoIndex = index;
                            
                            const playIndicator = currentElement.querySelector('.play-indicator');
                            if (playIndicator) {
                                playIndicator.classList.remove('show');
                            }
                            
                            currentElement.classList.add('playing');
                            
                            const unmuteBtn = currentElement.querySelector('.unmute-btn i');
                            if (unmuteBtn) {
                                unmuteBtn.className = 'fas fa-volume-mute';
                            }
                        })
                        .catch(error => {
                            console.log('Autoplay failed:', error);
                            
                            const playIndicator = currentElement.querySelector('.play-indicator');
                            if (playIndicator) {
                                playIndicator.classList.add('show');
                            }
                            
                            currentElement.classList.remove('playing');
                            
                            const playVideoOnClick = () => {
                                video.play()
                                    .then(() => {
                                        if (playIndicator) {
                                            playIndicator.classList.remove('show');
                                        }
                                        currentElement.classList.add('playing');
                                        video.removeEventListener('click', playVideoOnClick);
                                    })
                                    .catch(e => console.log('Still cannot play:', e));
                            };
                            
                            video.addEventListener('click', playVideoOnClick, { once: true });
                        });
                }
                
                if (this.videos[index]) {
                    this.trackView(this.videos[index].id);
                }
            }
        }
    },
    
    async trackView(videoId) {
        if (!this.currentUser) return;
        
        try {
            await sb
                .from('video_views')
                .insert({
                    video_id: videoId,
                    user_id: this.currentUser.id,
                    viewed_at: new Date().toISOString()
                });
        } catch (error) {
            console.error('Error tracking view:', error);
        }
    },
    
    async toggleLike(videoId) {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', 'product-videos.html');
            sessionStorage.setItem('pendingLike', videoId);
            window.location.href = 'login.html?redirect=product-videos.html';
            return;
        }
        
        try {
            const video = this.videos.find(v => v.id === videoId);
            const isLiked = this.likes.has(videoId);
            
            if (isLiked) {
                const { error } = await sb
                    .from('video_likes')
                    .delete()
                    .eq('video_id', videoId)
                    .eq('user_id', this.currentUser.id);
                
                if (error) throw error;
                
                this.likes.delete(videoId);
                video.likes = Math.max(0, (video.likes || 1) - 1);
            } else {
                const { error } = await sb
                    .from('video_likes')
                    .insert({
                        video_id: videoId,
                        user_id: this.currentUser.id,
                        created_at: new Date().toISOString()
                    });
                
                if (error) throw error;
                
                this.likes.add(videoId);
                video.likes = (video.likes || 0) + 1;
            }
            
            video.liked = !isLiked;
            this.updateLikeButton(videoId);
            
            const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
            if (videoElement && !isLiked) {
                const heartIcon = videoElement.querySelector('.action-btn:first-child i');
                heartIcon.classList.add('heart-pop');
                setTimeout(() => heartIcon.classList.remove('heart-pop'), 300);
            }
            
        } catch (error) {
            console.error('Error toggling like:', error);
            this.showToast('Error updating like', 'error');
        }
    },
    
    updateLikeButton(videoId) {
        const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
        if (videoElement) {
            const likeBtn = videoElement.querySelector('.action-btn:first-child');
            const likeCount = videoElement.querySelector('.like-count');
            const video = this.videos.find(v => v.id === videoId);
            
            if (likeBtn) likeBtn.classList.toggle('liked', video.liked);
            if (likeCount) likeCount.textContent = video.likes || 0;
        }
    },
    
    async openComments(videoId) {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', 'product-videos.html');
            sessionStorage.setItem('pendingComment', videoId);
            window.location.href = 'login.html?redirect=product-videos.html';
            return;
        }
        
        this.currentCommentVideoId = videoId;
        
        try {
            const { data, error } = await sb
                .from('video_comments')
                .select(`
                    *,
                    user:profiles!video_comments_user_id_fkey (
                        id,
                        full_name,
                        avatar_url
                    )
                `)
                .eq('video_id', videoId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            const commentsList = document.getElementById('commentsList');
            const commentCount = document.getElementById('commentCount');
            
            if (commentCount) commentCount.textContent = data.length;
            
            if (commentsList) {
                if (data.length === 0) {
                    commentsList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--gray-500);">No comments yet. Be the first to comment!</div>';
                } else {
                    commentsList.innerHTML = data.map(comment => {
                        const userName = comment.user?.full_name || 'User';
                        const userInitial = userName.charAt(0).toUpperCase();
                        const avatarUrl = comment.user?.avatar_url;
                        
                        return `
                            <div class="comment-item">
                                <div class="comment-avatar">
                                    ${avatarUrl 
                                        ? `<img src="${avatarUrl}">`
                                        : userInitial
                                    }
                                </div>
                                <div class="comment-content">
                                    <div class="comment-name">${this.escapeHtml(userName)}</div>
                                    <div class="comment-text">${this.escapeHtml(comment.comment)}</div>
                                    <div class="comment-time">${this.timeAgo(comment.created_at)}</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
            
            setTimeout(() => {
                document.getElementById('commentInput')?.focus();
            }, 300);
            
            document.getElementById('commentsModal')?.classList.add('show');
            
        } catch (error) {
            console.error('Error loading comments:', error);
            this.showToast('Error loading comments', 'error');
        }
    },
    
    async addComment() {
        if (!this.currentUser) {
            window.location.href = 'login.html?redirect=product-videos.html';
            return;
        }
        
        const input = document.getElementById('commentInput');
        if (!input) return;
        
        const comment = input.value.trim();
        if (!comment) return;
        
        input.disabled = true;
        
        try {
            const { error } = await sb
                .from('video_comments')
                .insert({
                    video_id: this.currentCommentVideoId,
                    user_id: this.currentUser.id,
                    comment: comment,
                    created_at: new Date().toISOString()
                });
            
            if (error) throw error;
            
            input.value = '';
            this.showToast('Comment added', 'success');
            await this.openComments(this.currentCommentVideoId);
            
            const video = this.videos.find(v => v.id === this.currentCommentVideoId);
            if (video) {
                video.comments = (video.comments || 0) + 1;
                this.updateCommentCount(video.id);
            }
            
        } catch (error) {
            console.error('Error adding comment:', error);
            this.showToast('Error adding comment', 'error');
        } finally {
            input.disabled = false;
        }
    },
    
    updateCommentCount(videoId) {
        const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
        if (videoElement) {
            const commentBtn = videoElement.querySelectorAll('.action-btn')[1];
            const commentCount = commentBtn?.querySelector('span');
            const video = this.videos.find(v => v.id === videoId);
            
            if (commentCount) commentCount.textContent = video.comments || 0;
        }
    },
    
    sendInquiry(videoId, supplierId, productId) {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', 'product-videos.html');
            sessionStorage.setItem('pendingInquiry', JSON.stringify({ videoId, supplierId, productId }));
            window.location.href = 'login.html?redirect=product-videos.html';
            return;
        }
        
        sb.from('video_inquiries').insert({
            video_id: videoId,
            user_id: this.currentUser.id,
            created_at: new Date().toISOString()
        }).then();
        
        this.showToast('Opening chat...', 'info');
        
        setTimeout(() => {
            window.location.href = `chat.html?supplier=${supplierId}&product=${productId}&from=video`;
        }, 500);
    },
    
    shareVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        const url = window.location.href.split('?')[0] + '?video=' + videoId;
        const title = video?.product?.title || 'Check out this product';
        
        if (navigator.share) {
            navigator.share({
                title: title,
                text: video?.caption || 'Check out this product on iBlue B2B',
                url: url
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url);
            this.showToast('Link copied to clipboard', 'success');
        }
    },
    
    viewSupplier(supplierId) {
        window.location.href = `supplier-profile.html?id=${supplierId}`;
    },
    
    loadMoreVideos() {
        if (this.hasMore && !this.isLoading) {
            this.currentPage++;
            this.loadVideos();
        }
    },
    
    timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        if (seconds < 2592000) return Math.floor(seconds / 86400) + 'd ago';
        return date.toLocaleDateString();
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    closeComments() {
        document.getElementById('commentsModal')?.classList.remove('show');
    },
    
    setupEventListeners() {
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                const videoItem = e.target.closest('.video-item');
                if (videoItem) {
                    const videoId = videoItem.dataset.videoId;
                    if (videoId) {
                        const heartIcon = videoItem.querySelector('.action-btn:first-child i');
                        heartIcon.classList.add('heart-pop');
                        setTimeout(() => heartIcon.classList.remove('heart-pop'), 300);
                        
                        this.toggleLike(parseInt(videoId));
                    }
                }
            }
            lastTap = now;
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = Math.max(0, this.currentVideoIndex - 1);
                if (this.videoElements[prevIndex]) {
                    this.videoElements[prevIndex].scrollIntoView({ behavior: 'smooth' });
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = Math.min(this.videoElements.length - 1, this.currentVideoIndex + 1);
                if (this.videoElements[nextIndex]) {
                    this.videoElements[nextIndex].scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                const currentVideo = this.videoElements[this.currentVideoIndex]?.querySelector('video');
                if (currentVideo) currentVideo.pause();
            } else {
                const currentVideo = this.videoElements[this.currentVideoIndex]?.querySelector('video');
                if (currentVideo) {
                    currentVideo.play().catch(() => {});
                }
            }
        });
        
        document.getElementById('commentsModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('commentsModal')) {
                this.closeComments();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeComments();
            }
        });
    }
};

// Global functions
window.VideoFeed = VideoFeed;
window.openComments = (id) => VideoFeed.openComments(id);
window.closeComments = () => VideoFeed.closeComments();
window.addComment = () => VideoFeed.addComment();
window.sendInquiry = (videoId, supplierId, productId) => VideoFeed.sendInquiry(videoId, supplierId, productId);
window.openSearch = () => window.location.href = 'search.html';
window.viewSupplier = (id) => VideoFeed.viewSupplier(id);
window.toggleMute = (button, videoId) => VideoFeed.toggleMute(button, videoId);

// Check for pending actions after login
document.addEventListener('DOMContentLoaded', () => {
    const pendingLike = sessionStorage.getItem('pendingLike');
    const pendingComment = sessionStorage.getItem('pendingComment');
    const pendingInquiry = sessionStorage.getItem('pendingInquiry');
    
    if (pendingLike) {
        sessionStorage.removeItem('pendingLike');
        setTimeout(() => VideoFeed.toggleLike(parseInt(pendingLike)), 1000);
    }
    
    if (pendingComment) {
        sessionStorage.removeItem('pendingComment');
        setTimeout(() => VideoFeed.openComments(parseInt(pendingComment)), 1000);
    }
    
    if (pendingInquiry) {
        const inquiry = JSON.parse(pendingInquiry);
        sessionStorage.removeItem('pendingInquiry');
        setTimeout(() => VideoFeed.sendInquiry(inquiry.videoId, inquiry.supplierId, inquiry.productId), 1000);
    }
});

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VideoFeed.init());
} else {
    VideoFeed.init();
}