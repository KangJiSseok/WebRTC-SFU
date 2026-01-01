package com.signaling.model;

import java.util.List;

public class RoomEventPageResponse {

    private List<RoomEventResponse> items;
    private long total;
    private String nextCursor;
    private String prevCursor;
    private boolean hasNext;

    public List<RoomEventResponse> getItems() {
        return items;
    }

    public void setItems(List<RoomEventResponse> items) {
        this.items = items;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public String getNextCursor() {
        return nextCursor;
    }

    public void setNextCursor(String nextCursor) {
        this.nextCursor = nextCursor;
    }

    public String getPrevCursor() {
        return prevCursor;
    }

    public void setPrevCursor(String prevCursor) {
        this.prevCursor = prevCursor;
    }

    public boolean isHasNext() {
        return hasNext;
    }

    public void setHasNext(boolean hasNext) {
        this.hasNext = hasNext;
    }
}
