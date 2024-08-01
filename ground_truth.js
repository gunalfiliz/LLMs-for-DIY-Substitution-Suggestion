const express = require('express');
const cheerio = require('cheerio');
const app = express();
const port = 3000;
const puppeteer = require('puppeteer');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const { google } = require('googleapis');

const args = process.argv.slice(2); 
const given_link = `${args[0]} `; 
const project_title= `${args[1]}`; 


// Functions to determine the platform
function isYoutubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?youtube\.com/.test(url);
}
function isInstructablesUrl(url) {
    return /^(https?:\/\/)?(www\.)?instructables\.com/.test(url);
}
/*
function isThingiverseUrl(url) {
    console.log("It is Thingiverse")
    return /^(https?:\/\/)?(www\.)?thingiverse\.com/.test(url);
}
*/

// Function to extract video ID from YouTube URL
function extractVideoId(url) {
    url = url.trim(); 
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/.*[?&]v=([^&#]*)/);
    return match ? match[1] : null;
}
/*
function appendCommentsToThingiverseUrl(url) {
    if (!url.endsWith("/comments")) {
        url=url.trim();
        url += "/comments";
    }
    return url;
}
*/


// Function to fetch comments from Instructables URL
const fetchInstructionsInstructables = async (url) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url);
        // Add your scraping logic here
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
        
        await browser.close();


        // Check if the folder exists
        const dir = `./results/${project_title}`;
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true }); 
        }

        const csvFilePath = `${dir}/${project_title}_ground_truth.csv`;

        const prepareCommentsForCsv = (comments) => {
            const flatComments = [];

            comments.forEach(comment => {
                // Push main comment
                flatComments.push({
                    commentID: comment.commentID,
                    authorName: comment.authorName,
                    commentText: comment.commentText,
                });

            
                comment.replies.forEach(reply => {
                    flatComments.push({
                        commentID: reply.commentID,
                        authorName: reply.authorName,
                        commentText: reply.commentText,
                    });
                });
            });

            return flatComments;
        };

    
        const flatCommentsForCsv = prepareCommentsForCsv(comments);
        const csvWriter = createObjectCsvWriter({
            path: csvFilePath,
            header: [
                {id:'commentID', title: 'ID'},
                {id:'commentText', title: 'original'},
                {id:'authorName', title: 'Username'}
            ],
            fieldDelimiter: ';' 
        });
        
        await csvWriter.writeRecords(flatCommentsForCsv);
        console.log(`Data has been saved to ${csvFilePath}`);
    } catch (error) {
        console.error('Error fetching and parsing from Instructables:', error.message);
    }
};

// Function to fetch comments from YouTube URL
const fetchInstructionsYoutube = async (videoId) => {
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
                    commentID,
                    authorName,
                    commentText,
                    replies,
                });
            });

            pageToken = response.data.nextPageToken ? response.data.nextPageToken : '';

        } catch (error) {
            console.error('Failed to fetch comments:', error);
            break;
        }
    } while (pageToken);

    const dir = `./results/${project_title}`;
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }

    const csvFilePath = `${dir}/${project_title}_ground_truth.csv`;
    const flatCommentsForCsv = commentsData.flatMap(comment => [
        {
            commentID: comment.commentID,
            authorName: comment.authorName,
            commentText: comment.commentText,
        },
        ...comment.replies.map(reply => ({
            commentID: reply.commentID,
            authorName: reply.authorName,
            commentText: reply.commentText,
        }))
    ]);

    const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
            {id:'commentID', title: 'ID'},
            {id:'commentText', title: 'original'},
            {id:'authorName', title: 'Username'}
        ],
        fieldDelimiter: ';'
    });

    await csvWriter.writeRecords(flatCommentsForCsv);
    console.log(`Data has been saved to ${csvFilePath}`);
};

/*
// Function to fetch comments from Thingiverse URL
const fetchInstructionsThingiverse = async (url) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url);
        console.log("url is ", url)
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
                .waitForSelector(cssSelector, { visible: true, timeout: 2000 }) // Adjusted timeout to 20 seconds
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
            
        const html = await page.evaluate(() => document.body.innerHTML);
        const $ = cheerio.load(html);

        const comments = $('.Comment__commentWrapper--vlKZd.Comment__isRoot--_n39y').map((index, element) => {
            const commentID = $(element).attr('id');
            const authorName = $(element).find('.CommentHeader__commentTitle--cQLD4').text().trim();
            const commentText = $(element).find('.CommentBody__commentBodyContent--bTDwX p').text().trim();
            const replies = $(element).find('.Comment__commentReplyContainer--ICi5Z.Comment__hasReplies--uXNYc .Comment__commentWrapper--vlKZd').map((replyIndex, replyElement) => {
                const commentID = $(replyElement).attr('id');
                const authorName = $(replyElement).find('.CommentHeader__commentTitle--cQLD4').text().trim();
                const commentText = $(replyElement).find('.CommentBody__commentBodyContent--bTDwX p').text().trim();
        
                return {
                    commentID,
                    authorName,
                    commentText
                };
            }).get();
        
            return {
              commentID,
              authorName,
              commentText,
              replies
            };
        }).get();

        const comments_str = JSON.stringify(comments);

        console.log("this is comments in json",comments_str);
        await browser.close();
        
        const dir = `./results/${project_title}`;
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }

  
        const csvFilePath = `${dir}/${project_title}_ground_truth.csv`;

        const prepareCommentsForCsv = (comments) => {
            const flatComments = [];

            comments.forEach(comment => {
                // Push main comment
                flatComments.push({
                    commentID: comment.commentID,
                    authorName: comment.authorName,
                    commentText: comment.commentText,
                });

                comment.replies.forEach(reply => {
                    flatComments.push({
                        commentID: reply.commentID,
                        authorName: reply.authorName,
                        commentText: reply.commentText,
                    });
                });
            });

            console.log("hey this is flatComments for Thingiverse\n", flatComments)

            return flatComments;
        };

    
        const flatCommentsForCsv = prepareCommentsForCsv(comments);
  
        const csvWriter = createObjectCsvWriter({
            path: csvFilePath,
            header: [
                {id:'commentID', title: 'ID'},
                {id:'commentText', title: 'original'},
                {id:'authorName', title: 'Username'}
            ],
            fieldDelimiter: ';' 
        });
        
        await csvWriter.writeRecords(flatCommentsForCsv);
        console.log(`Data has been saved to ${csvFilePath}`);
    } catch (error) {
        console.error('Error fetching and parsing:', error.message);

    }
};

*/

if (isYoutubeUrl(given_link)) {
    console.log("Youtube")
    const videoId = extractVideoId(given_link);
    fetchInstructionsYoutube(videoId);
} else if (isInstructablesUrl(given_link)) {
    console.log("Instructables")
    fetchInstructionsInstructables(given_link);
} else if (isThingiverseUrl(given_link)) {
    console.log("Thingiverse")
    const modifiedUrl = appendCommentsToThingiverseUrl(given_link);
    fetchInstructionsThingiverse(modifiedUrl);
} else {
    console.log("Nothing")
    res.status(400).send('Unsupported URL');
    return;
}





    
