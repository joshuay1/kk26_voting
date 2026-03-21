/**
 * Feedback Form Handler with Firebase Integration
 * Handles form submission and stores feedback in Firebase Firestore
 */

// Initialize form handler when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('feedback-form');
    const stage1 = document.getElementById('stage-1');
    const stage2 = document.getElementById('stage-2');
    const stage2SkipBtn = document.getElementById('stage-2-skip');
    const messageContainer = document.getElementById('message-container');

    let stage1Data = null; // Store stage 1 data
    let stage1DocumentId = null; // Store Firebase document ID

    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Skip stage 2 button
    if (stage2SkipBtn) {
        stage2SkipBtn.addEventListener('click', function() {
            showMessage('success', 'Vielen Dank für Ihr Feedback!');
            stage2.classList.add('stage-hidden');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        });
    }

    /**
     * Handle form submission
     * @param {Event} event - Form submit event
     */
    async function handleFormSubmit(event) {
        event.preventDefault();

        const isStage2Visible = !stage2.classList.contains('stage-hidden');
        const submitBtn = isStage2Visible ?
            document.getElementById('stage-2-submit') :
            document.getElementById('stage-1-submit');

        // Disable submit button during processing
        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Wird gesendet...';

        // Clear previous messages
        messageContainer.innerHTML = '';

        try {
            if (isStage2Visible) {
                // Stage 2: Submit detailed questions
                await handleStage2Submit();
            } else {
                // Stage 1: Submit initial feedback
                await handleStage1Submit();
            }

        } catch (error) {
            console.error('Error submitting feedback:', error);
            showMessage('error', error.message || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    /**
     * Handle Stage 1 submission (initial quick feedback)
     */
    async function handleStage1Submit() {
        const submitBtn = document.getElementById('stage-1-submit');

        try {
            // Collect stage 1 data
            stage1Data = collectStage1Data();

            // Validate stage 1 data
            if (!validateStage1Data(stage1Data)) {
                throw new Error('Bitte beantworten Sie alle erforderlichen Fragen.');
            }

            // Submit to Firebase
            const docRef = await submitToFirebase(stage1Data);
            stage1DocumentId = docRef.id;

            // Hide stage 1
            stage1.classList.add('stage-hidden');

            // Show stage 2 directly
            stage2.classList.remove('stage-hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Feedback absenden';
        }
    }

    /**
     * Handle Stage 2 submission (detailed questions)
     */
    async function handleStage2Submit() {
        const submitBtn = document.getElementById('stage-2-submit');

        try {
            // Collect stage 2 data
            const stage2Data = collectStage2Data();

            // Update the existing Firebase document with stage 2 data
            await updateFirebaseDocument(stage1DocumentId, stage2Data);

            // Show success message
            showMessage('success', 'Vielen Dank! Ihr vollständiges Feedback wurde erfolgreich gespeichert.');

            // Hide stage 2
            stage2.classList.add('stage-hidden');

            // Scroll to message
            messageContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Redirect after delay
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);

        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Detailliertes Feedback absenden';
        }
    }

    /**
     * Collect Stage 1 data (quick feedback)
     * @returns {Object} Form data object
     */
    function collectStage1Data() {
        const userIdSelect = document.getElementById('user-id-select');
        const userId = userIdSelect?.value || null;

        const data = {
            user_id: userId,
            open_question: document.getElementById('open-question')?.value.trim() || '',
            overall_understanding: getRadioValue('overall_understanding'),
            feeling_contribution_before: getRadioValue('feeling_contribution_before'),
            feeling_contribution_after: getRadioValue('feeling_contribution_after'),
            stage_completed: 1,
            metadata: {
                submitted_at: new Date().toISOString(),
                stage_1_completed_at: new Date().toISOString(),
                user_agent: navigator.userAgent,
                screen_width: window.screen.width,
                screen_height: window.screen.height,
                theme: document.body.classList.contains('light-mode') ? 'light' : 'dark'
            }
        };

        return data;
    }

    /**
     * Collect Stage 2 data (detailed questions)
     * @returns {Object} Form data object
     */
    function collectStage2Data() {
        const data = {
            format_a: {
                q1_understanding_funding: getRadioValue('format_a_q1'),
                q2_vote_impact: getRadioValue('format_a_q2'),
                q3_transparency: getRadioValue('format_a_q3')
            },
            format_b: {
                q1_understanding_funding: getRadioValue('format_b_q1'),
                q2_vote_impact: getRadioValue('format_b_q2'),
                q3_transparency: getRadioValue('format_b_q3')
            },
            format_c: {
                q1_understanding_funding: getRadioValue('format_c_q1'),
                q2_vote_impact: getRadioValue('format_c_q2'),
                q3_transparency: getRadioValue('format_c_q3')
            },
            overall: {
                trust_in_result: getRadioValue('overall_trust')
            },
            stage_completed: 2,
            'metadata.stage_2_completed_at': new Date().toISOString()
        };

        return data;
    }

    /**
     * Get value of selected radio button
     * @param {string} name - Radio button group name
     * @returns {number|null} Selected value or null
     */
    function getRadioValue(name) {
        const selected = document.querySelector(`input[name="${name}"]:checked`);
        return selected ? parseInt(selected.value, 10) : null;
    }

    /**
     * Validate Stage 1 data
     * @param {Object} data - Form data object
     * @returns {boolean} True if valid
     */
    function validateStage1Data(data) {
        // Check open question is not empty
        if (!data.open_question || data.open_question.length < 10) {
            throw new Error('Bitte geben Sie mindestens 10 Zeichen in Ihr Feedback ein.');
        }

        // Check overall understanding is answered
        if (data.overall_understanding === null || data.overall_understanding < 1 || data.overall_understanding > 7) {
            throw new Error('Bitte beantworten Sie die Frage zum Verständnis.');
        }

        // Check feeling contribution before is answered
        if (data.feeling_contribution_before === null || data.feeling_contribution_before < 1 || data.feeling_contribution_before > 7) {
            throw new Error('Bitte beantworten Sie die Frage zum Beitragsgefühl (vor dem Ansehen der Quittung).');
        }

        // Check feeling contribution after is answered
        if (data.feeling_contribution_after === null || data.feeling_contribution_after < 1 || data.feeling_contribution_after > 7) {
            throw new Error('Bitte beantworten Sie die Frage zum Beitragsgefühl (nach dem Ansehen der Quittung).');
        }

        return true;
    }

    /**
     * Submit form data to Firebase Firestore
     * @param {Object} data - Form data object
     * @returns {Promise} Firebase submission promise
     */
    async function submitToFirebase(data) {
        // Check if Firebase is loaded
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('Firebase ist nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
        }

        try {
            const db = firebase.firestore();

            // Add document to 'feedback' collection
            const docRef = await db.collection('feedback').add(data);

            console.log('Feedback submitted with ID:', docRef.id);
            return docRef;

        } catch (error) {
            console.error('Firebase submission error:', error);

            // Provide user-friendly error messages
            if (error.code === 'permission-denied') {
                throw new Error('Zugriff verweigert. Bitte kontaktieren Sie den Administrator.');
            } else if (error.code === 'unavailable') {
                throw new Error('Firebase-Dienst ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.');
            } else {
                throw new Error('Fehler beim Speichern des Feedbacks: ' + error.message);
            }
        }
    }

    /**
     * Update existing Firebase document with Stage 2 data
     * @param {string} documentId - Document ID to update
     * @param {Object} data - Form data object
     * @returns {Promise} Firebase update promise
     */
    async function updateFirebaseDocument(documentId, data) {
        // Check if Firebase is loaded
        if (typeof firebase === 'undefined' || !firebase.firestore) {
            throw new Error('Firebase ist nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
        }

        try {
            const db = firebase.firestore();

            // Update document in 'feedback' collection
            await db.collection('feedback').doc(documentId).update(data);

            console.log('Feedback updated for ID:', documentId);

        } catch (error) {
            console.error('Firebase update error:', error);

            // Provide user-friendly error messages
            if (error.code === 'permission-denied') {
                throw new Error('Zugriff verweigert. Bitte kontaktieren Sie den Administrator.');
            } else if (error.code === 'unavailable') {
                throw new Error('Firebase-Dienst ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.');
            } else {
                throw new Error('Fehler beim Aktualisieren des Feedbacks: ' + error.message);
            }
        }
    }

    /**
     * Show message to user
     * @param {string} type - Message type ('success' or 'error')
     * @param {string} message - Message text
     */
    function showMessage(type, message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = type === 'success' ? 'success-message' : 'error-message';
        messageDiv.textContent = message;

        messageContainer.innerHTML = '';
        messageContainer.appendChild(messageDiv);

        // Auto-hide success messages after 8 seconds
        if (type === 'success') {
            setTimeout(() => {
                if (messageDiv.parentNode === messageContainer) {
                    messageDiv.style.opacity = '0';
                    messageDiv.style.transition = 'opacity 0.5s ease';
                    setTimeout(() => {
                        messageContainer.innerHTML = '';
                    }, 500);
                }
            }, 8000);
        }
    }

    /**
     * Development/Testing: Log form data without Firebase
     * Uncomment this if you want to test the form without Firebase connection
     */
    /*
    async function submitToFirebase(data) {
        console.log('=== FEEDBACK SUBMISSION (DEV MODE) ===');
        console.log(JSON.stringify(data, null, 2));

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return { id: 'dev-' + Date.now() };
    }
    */
});
