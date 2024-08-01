require('dotenv').config();
const express = require('express');
const app = express();
const cheerio = require('cheerio');
const { google } = require('googleapis');
const puppeteer = require('puppeteer');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


const port = 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


app.post('/clicked', async (req, res) => {
    try {
        const { url, transcript, title } = req.body;
        console.log('Received URL:', url);

        let fetchDataFunc;
        let source;

        if (isYoutubeUrl(url)) {
            const videoId = extractVideoId(url);
            fetchDataFunc = () => fetchInstructionsYoutube(videoId, transcript, title);
            source = "YouTube";
        } else if (isInstructablesUrl(url)) {
            fetchDataFunc = () => fetchInstructionsInstructables(url);
            source = "Instructables";
        } else if (isThingiverseUrl(url)) {
            fetchDataFunc = () => fetchInstructionsThingiverse(url);
            source = "Thingiverse";
        } else {
            res.status(400).send('Unsupported URL');
            return;
        }

        const respText = await requestChatGpt(source, fetchDataFunc);

        console.log("respText: " + respText);
        res.send(respText || "Undefined");
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});


async function requestChatGpt(source, fetchDataFunc) {
    try {
        console.log(`Request GPT for ${source}`);
        let { tutorial, imageUrls, base64Images } = await fetchDataFunc();

        const systemMessageContent = `
        We define substitution suggestions in the maker domain as recommendations to replace or add materials, tools, or processes in a project to alter or enhance at least one aspect of the project while maintaining the overall outcome. 

        Analyze the provided JSON text containing comments to identify substitution suggestions made by contributors regarding materials, tools, or processes used in the project. Consider both explicit suggestions and nuanced or implied substitutions that can be reasonably inferred from the comments. Disregard any substitution suggestions found in the project instructions.
        If there is more than one alternative for the same material, tool, or process, list them separately. 
        
        Format the output as follows:        
        Comprehensive List of Materials and Tools with Substitution Suggestions:
        1. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID])
        2. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID])
        3. [Original Material/Tool/Process] (Alternative: [Substitution Suggestion] | [authorName] ~ [commentID]) 
        ...
        
        Include all relevant substitution suggestions from the comments, whether explicit or reasonably inferred, while maintaining transparency about the source and nature of each suggestion.
        
        When analyzing the images, identify original materials, tools, or processes used in the project. Include these in your list, even if there are no substitution suggestions for them.

`;

// In the requestChatGpt function:
let messages;
if (source === "YouTube") {
    const limitedBase64Images = base64Images ? base64Images.slice(0, 3) : [];

    messages = [
        { role: "system", content: systemMessageContent },
        { 
            role: 'user', 
            content: [
                { type: "text", text: "Images from Project Instructions:" },
                ...limitedBase64Images.map(base64Image => ({
                    type: "image_url",
                    image_url: { url: base64Image }
                })),
                { type: "text", text: "\nProject Instructions and Comments:\n" + tutorial }
            ]
        }
    ];
} else if (source === "Instructables") {
    let imageUrlsArray = [];
    if (typeof imageUrls === 'string') {
        // If imageUrls is a string, split it into an array
        imageUrlsArray = imageUrls.split(',').map(url => url.trim());
    } else if (Array.isArray(imageUrls)) {
        // If imageUrls is already an array, use it as is
        imageUrlsArray = imageUrls;
    }

    const limitedImageUrls = imageUrlsArray.slice(0, 3);

    messages = [
        { role: "system", content: systemMessageContent },
        { 
            role: 'user', 
            content: [
                { type: "text", text: tutorial },
                ...limitedImageUrls.map(url => ({
                    type: "image_url",
                    image_url: { url: url }
                }))
            ]
        }
    ];
}
        
        else {
            throw new Error('Unsupported source');
        }

        const data = await openai.chat.completions.create({
            messages: messages,
            model: 'gpt-4o',
        });

        return data.choices[0].message["content"];
    } catch (error) {
        console.error(`Error requesting GPT for ${source}:`, error);
        throw error;
    }
}


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

// Function to determine if the URL is from YouTube
function isYoutubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?youtube\.com/.test(url);
}

// Function to determine if the URL is from Instructables
function isInstructablesUrl(url) {
    return /^(https?:\/\/)?(www\.)?instructables\.com/.test(url);
}

// Add the function to determine if the URL is from Thingiverse
function isThingiverseUrl(url) {
    return /^(https?:\/\/)?(www\.)?thingiverse\.com/.test(url);
}


// Function to extract video ID from YouTube URL
function extractVideoId(url) {
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/.*[?&]v=([^&#]*)/);
    return match ? match[1] : null;
}

function appendCommentsToThingiverseUrl(url) {
    if (!url.endsWith("/comments")) {
        url += "/comments";
    }
    return url;
}


// Function to fetch comments from Instructables URL
const fetchInstructionsInstructables = async (url) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url);
        const cssSelector = 'div.commentsActions__fmcCB button';
        const isElementVisible = async (page, cssSelector) => {
            let visible = true;
            await page
                .waitForSelector(cssSelector, { visible: true, timeout: 2000 })
                .catch(() => {
                    visible = false;
                });
            return visible;
        };

        

        let loadMoreVisible = await isElementVisible(page, 'div.commentsActions__fmcCB button'); 
        while (loadMoreVisible) {
            await page.click('div.commentsActions__fmcCB button').catch(() => {});
            loadMoreVisible = await isElementVisible(page, 'div.commentsActions__fmcCB button');
        }

        const html = await page.evaluate(() => document.body.innerHTML);
        const $ = cheerio.load(html);

        // Extracting instructions
        const instructions = $('section.step').map((index, element) => {
            // Step of the title, not the instruction !!!
            const titleofStep = $(element).find('h2.step-title').text().trim();
            const descriptionofInstruction = $(element).find('.step-body').text().trim();
            return {
                titleofStep,
                descriptionofInstruction
            };
        }).get();

        const imageUrls = $('div.photoset-image a.gallery-link img').map((index, element) => $(element).attr('src')).get();

        const comments = $('div.comments__shADL > div.comment__ZYOAD').map((index, element) => {
            const commentID = $(element).find('> div.comment__unIAC').attr('id');
            const authorName = $(element).find('> div.comment__unIAC > div.content__ypVoT > div.meta__fFtvj div.user__UfhwD a').text().trim();
            const commentText = $(element).find('> div.comment__unIAC > div.content__ypVoT > p').map((index, pElement) => $(pElement).text().trim()).get().join('\n');

            const replies = $(element).find('details.replies__Veglt div.comment__unIAC').map((replyIndex, replyElement) => {
                const commentID = $(replyElement).attr('id');
                const authorName = $(replyElement).find('div.user__UfhwD a').text().trim();
                const commentText = $(replyElement).find('div.content__ypVoT p').map((index, pElement) => $(pElement).text().trim()).get().join('\n');
        
                return {
                    commentID,
                    authorName,
                    commentText,
                };
            }).get();
        
            return {
                commentID,
                authorName,
                commentText,
                replies,
            };
        }).get();
        
        const instructions_str = JSON.stringify(instructions);
        const comments_str = JSON.stringify(comments);
        const imageUrls_str = JSON.stringify(imageUrls);

        const tutorial = JSON.stringify({comments: comments_str,  instructions: instructions_str});
        const URLs = JSON.stringify(imageUrls)

        console.log(tutorial, URLs);
        await browser.close();
        return { tutorial, imageUrls};
    } catch (error) {
        console.error('Error fetching and parsing from Instructables:', error.message);
        return { tutorial: undefined };
    }
};

const fs = require('fs').promises; // Import the built-in file system module

// Function to fetch comments from YouTube URL
const fetchInstructionsYoutube = async (videoId, transcript, title) => {
    try {
        const dataUrlsFilePath = `video_images/${title}/${title}_data_urls.txt`; 
        const imageUrls = await fs.readFile(dataUrlsFilePath, 'utf-8');

        const youtube = google.youtube({
            version: 'v3',
            auth: process.env.YOUTUBE_API_KEY,
        });

        let pageToken = '';
        let commentsData = [];

        do {
            try {
                const response = await youtube.commentThreads.list({
                    part: "snippet,replies",
                    videoId: videoId,
                    textFormat: "plainText",
                    pageToken: pageToken,
                    maxResults: 100,
                });

                response.data.items.forEach(item => {
                    const commentID = item.snippet.topLevelComment.id;
                    const commentText = item.snippet.topLevelComment.snippet.textDisplay;
                    const authorName = item.snippet.topLevelComment.snippet.authorDisplayName;
                    const replies = item.replies ? item.replies.comments.map(reply => ({
                        commentID: reply.id,
                        authorName: reply.snippet.authorDisplayName,
                        commentText: reply.snippet.textDisplay
                    })) : [];
                    commentsData.push({
                        commentID: commentID,
                        authorName: authorName,
                        commentText: commentText,
                        replies: replies,
                    });
                });

                pageToken = response.data.nextPageToken ? response.data.nextPageToken : '';
            } catch (error) {
                console.error('Failed to fetch comments:', error);
                break; // Exit the loop on error
            }
        } while (pageToken);

        const comments_str = JSON.stringify(commentsData);
        const instructions = [{descriptionofInstruction: transcript }];
        const instructions_str = JSON.stringify(instructions);
        const tutorial = JSON.stringify({ comments: comments_str, instructions: instructions_str });

        console.log(tutorial, imageUrls);

        return { tutorial, imageUrls};
    } catch (error) {
        console.error('Error fetching and parsing from YouTube:', error.message);
        return { tutorial: undefined };
    }
};

/*
// Function to fetch comments from Thingiverse URL
const fetchInstructionsThingiverse = async (url) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(url);
        const acceptCookiesSelector2 = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';
        if (await page.$(acceptCookiesSelector2) !== null) {
            await page.click(acceptCookiesSelector2);
        }
        const mainHtml = await page.evaluate(() => document.body.innerHTML);
        const $main = cheerio.load(mainHtml);

        const project = $main('.ThingPage__thingPageContentWrapper--qHQro').map((index, element) => {
            const title = $main(element).find('h1.DetailPageTitle__thingTitleName--sGpkS').text().trim();
            const instruction = $main(element).find('#Summary .DetailDescriptionSummary__detailDescriptionSummary--UMoKx').text().trim();
            return {
                title,
                instruction
            };
        }).get();

        // Fetch comments with /comments
        const commentsUrl = appendCommentsToThingiverseUrl(url);
        await page.goto(commentsUrl);
        
        // Try to accept cookies if the popup appears
        const acceptCookiesSelector = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';
        if (await page.$(acceptCookiesSelector) !== null) {
            await page.click(acceptCookiesSelector);
        }

        const selector1 = 'button[aria-label="Load more comments"]';
        const selector2 = 'button[aria-label="Show replies"]';

        const isElementVisible = async (page, cssSelector) => {
            let visible = true;
            await page
                .waitForSelector(cssSelector, { visible: true, timeout: 2000 }) 
                .catch(() => {
                    visible = false;
                });
            return visible;
        };

        let loadMoreVisible1 = await isElementVisible(page, selector1); 
        while (loadMoreVisible1) {
            await page.click(selector1).catch(() => {});
            // Wait for network activity to settle after clicking
            // Check if the button is still visible after loading completes
            loadMoreVisible1 = await isElementVisible(page, selector1);
        }
        
        let loadMoreVisible2 = await isElementVisible(page, selector2); 
        while (loadMoreVisible2) {
            await page.click(selector2).catch(() => {});
            // Check if the button is still visible after loading completes
            loadMoreVisible2 = await isElementVisible(page, selector2);
        }

        const commentsHtml = await page.evaluate(() => document.body.innerHTML);
        const $comments = cheerio.load(commentsHtml);

        const comments = $comments('.Comment__commentWrapper--vlKZd.Comment__isRoot--_n39y').map((index, element) => {
            const commentID = $comments(element).attr('id');
            const authorName = $comments(element).find('.CommentHeader__commentTitle--cQLD4').text().trim();
            const commentText = $comments(element).find('.CommentBody__commentBodyContent--bTDwX p').text().trim();
            const replies = $comments(element).find('.Comment__commentReplyContainer--ICi5Z.Comment__hasReplies--uXNYc .Comment__commentWrapper--vlKZd').map((replyIndex, replyElement) => {
                const replyCommentID = $comments(replyElement).attr('id');
                const replyAuthorName = $comments(replyElement).find('.CommentHeader__commentTitle--cQLD4').text().trim();
                const replyCommentText = $comments(replyElement).find('.CommentBody__commentBodyContent--bTDwX p').text().trim();
        
                return {
                    commentID: replyCommentID,
                    authorName: replyAuthorName,
                    commentText: replyCommentText
                };
            }).get();
        
            return {
              commentID,
              authorName,
              commentText,
              replies
            };
        }).get();

        const project_str = JSON.stringify(project);
        const comments_str = JSON.stringify(comments);

        const tutorial = JSON.stringify({ comments: comments_str, project: project_str });

        console.log(tutorial);
        await browser.close();
        return { tutorial };
    } catch (error) {
        console.error('Error fetching and parsing from Instructables:', error.message);
        return { tutorial: undefined };
    }
};
*/
