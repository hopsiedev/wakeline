import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pastedImages,validateImageSelection,modelLabel} from '../src/services/chat-input.ts';
test('image selection allows ten images and rejects an eleventh while preserving validation',()=>{
 const image={type:'image/png',size:1024};
 assert.equal(validateImageSelection([], [image]),null);
 assert.equal(validateImageSelection([],Array(10).fill(image)),null);
 assert.equal(validateImageSelection([image,image,image],Array(7).fill(image)),null);
 assert.equal(validateImageSelection([image],Array(10).fill(image)),'count');
 assert.equal(validateImageSelection([], [{type:'image/svg+xml',size:42}]),'type');
 assert.equal(validateImageSelection([], [{type:'image/png',size:6*1024*1024}]),'limit');
 assert.equal(validateImageSelection([{...image,size:5*1024*1024}],[{...image,size:5*1024*1024},image]),'limit');
});
test('model labels preserve an exact version rather than hiding it behind an alias',()=>{
 assert.equal(modelLabel('claude-sonnet-5-5'),'Sonnet 5.5');
 assert.equal(modelLabel('claude-opus-4-6'),'Opus 4.6');
 assert.equal(modelLabel('sonnet'),'Sonnet');
});

test('pasting an image keeps the file and ignores text and empty clipboard entries',()=>{const file=new File(['png'],'pasted.png',{type:'image/png'});assert.deepEqual(pastedImages([{kind:'string',type:'text/plain',getAsFile:()=>null},{kind:'file',type:'image/png',getAsFile:()=>file},{kind:'file',type:'image/png',getAsFile:()=>null}]),[file]);});
