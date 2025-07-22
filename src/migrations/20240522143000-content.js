/**
 * Migration: setting content field to 'fr' in 'content' model
 * Created at: 2024-05-21T10:00:00.000Z
 */

export const up = async (db) => {
    const datasCollection = db.collection("datas");
    const content = await datasCollection.find({ _model:"content"}).toArray();
    await Promise.all(content.map(async (doc) => {
        if (typeof(doc.html)==='string') {
            const c = { "fr" : doc.html };
            await datasCollection.updateOne({_id: doc._id}, {$set: {html: c}});
        }
    }));
    console.log("Migration UP: setting content field to 'fr' in 'content' model");
};

export const down = async (db) => {
    console.log("Migration DOWN: noting to do");
};