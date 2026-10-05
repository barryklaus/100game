"""Calibrate donor drawings to master face units, without silhouette fitting."""
import numpy as np
from PIL import Image, ImageDraw

def hull(points):
    points=sorted(set(points))
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    low=[]; high=[]
    for p in points:
        while len(low)>=2 and cross(low[-2],low[-1],p)<=0: low.pop()
        low.append(p)
    for p in reversed(points):
        while len(high)>=2 and cross(high[-2],high[-1],p)<=0: high.pop()
        high.append(p)
    return low[:-1]+high[:-1]

def eye_candidates(im):
    a=np.array(im.convert('RGBA')).astype(int)
    white=(a[:,:,:3].min(axis=2)>190)&(np.ptp(a[:,:,:3],axis=2)<55)&(a[:,:,3]>128)
    seen=np.zeros(white.shape,bool); result=[]
    for y,x in zip(*np.where(white)):
        if seen[y,x]: continue
        todo=[(int(y),int(x))]; seen[y,x]=1; points=[]
        while todo:
            yy,xx=todo.pop(); points.append((xx,yy))
            for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
                ny,nx=yy+dy,xx+dx
                if 0<=ny<white.shape[0] and 0<=nx<white.shape[1] and white[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=1; todo.append((ny,nx))
        if not 35<len(points)<3500: continue
        p=np.array(points);lo=p.min(axis=0);hi=p.max(axis=0)+1;w,h=hi-lo
        if min(w,h)<7 or max(w,h)>max(90,im.width*.09) or not .4<w/h<3: continue
        poly=Image.new('L',(int(w),int(h)))
        ImageDraw.Draw(poly).polygon(hull([tuple(v-lo) for v in p]),fill=255)
        inner=np.array(poly)>0
        crop=a[lo[1]:hi[1],lo[0]:hi[0],:3]
        dark=(crop.min(axis=2)<120)&inner
        ratio=dark.sum()/max(1,inner.sum())
        if not .04<ratio<.65: continue
        # White shirts, collars and shoes can also enclose dark pixels.
        # Actual eyes must be surrounded by the character's warm skin.
        pad=max(4,round(min(w,h)*.3))
        x0,y0=max(0,lo[0]-pad),max(0,lo[1]-pad)
        x1,y1=min(im.width,hi[0]+pad),min(im.height,hi[1]+pad)
        ring=a[y0:y1,x0:x1]
        skin=(ring[:,:,0]>100)&(ring[:,:,0]>ring[:,:,1]*1.15)&(ring[:,:,1]>ring[:,:,2]*1.10)&(ring[:,:,3]>128)
        guard=np.ones(skin.shape,bool);guard[lo[1]-y0:hi[1]-y0,lo[0]-x0:hi[0]-x0]=False
        skin_ratio=skin[guard].mean()
        if skin_ratio<.15:continue
        result.append({'center':(lo+hi-1)/2,'size':np.array([w,h]),'area':len(points),'ratio':ratio,'skin':skin_ratio})
    return result

def eye_pair(im):
    candidates=eye_candidates(im); pairs=[]
    for i,a in enumerate(candidates):
        for b in candidates[i+1:]:
            left,right=sorted([a,b],key=lambda v:v['center'][0])
            delta=right['center']-left['center'];dist=np.linalg.norm(delta)
            width=(a['size'][0]+b['size'][0])/2
            if not width*.95<dist<width*3.8 or abs(delta[1])>dist*.72: continue
            similarity=min(a['area'],b['area'])/max(a['area'],b['area'])
            if similarity<.2: continue
            score=similarity*(a['area']+b['area'])*(min(a['ratio'],b['ratio'])+.05)*min(a['skin'],b['skin'])**2
            pairs.append((score,np.array([left['center'],right['center']])))
    if not pairs: raise ValueError('No coherent pupil-bearing eye pair; needs explicit calibration')
    return max(pairs,key=lambda pair:pair[0])[1]

def affine(im,m,offset,size=(2048,2048)):
    inverse=np.linalg.inv(m); t=-inverse@offset
    return im.transform(size,Image.Transform.AFFINE,(inverse[0,0],inverse[0,1],t[0],inverse[1,0],inverse[1,1],t[1]),Image.Resampling.BICUBIC)

def registration(source_eyes,target_eyes):
    src=source_eyes[1]-source_eyes[0]; dst=target_eyes[1]-target_eyes[0]
    scale=np.linalg.norm(dst)/np.linalg.norm(src)
    angle=np.arctan2(dst[1],dst[0])-np.arctan2(src[1],src[0])
    rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
    m=scale*rotation
    return m,target_eyes.mean(axis=0)-m@source_eyes.mean(axis=0),float(scale),float(angle)
